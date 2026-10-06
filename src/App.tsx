import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertTriangle, Archive, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Download,
  Eye, FileCheck2, FileJson2, FileStack, FileText, FolderOpen, Globe2, HardDrive, Languages,
  LayoutDashboard, ListChecks, LoaderCircle, LockKeyhole, PackageCheck, Plus, RefreshCcw,
  ShieldCheck, Sparkles, Trash2, UploadCloud, Wand2, X, Search, Undo2, FlaskConical, ArrowUpRight, FileDown, ScanLine, CalendarClock,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  canAssignFile, formatBytes, getDuplicateHashes, getRequirementStatus, isBlockingStatus,
  parseRequirements, sha256, suggestAssignments, matchScore, matcherStats, type AssignmentState, type Language,
  type RequirementStatus, type RequirementsData, type UploadedPdf,
} from './engine';
import { statusLabel, t } from './i18n';
import { createTenderPackage } from './pdf';

const MAX_FILES = 30;
const MAX_BYTES = 50 * 1024 * 1024;

type PreviewState = { url: string; title: string; temporary: boolean } | null;
type GeneratedState = { url: string; fileName: string; pageCount: number } | null;

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function blobFromBytes(bytes: Uint8Array, type: string): Blob {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type });
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const text = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function StatusPill({ status, language }: { status: RequirementStatus; language: Language }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'not-provided' ? Clock3 : status === 'expired' || status === 'expiry-needed' ? CalendarClock : CircleAlert;
  return <span className={`status-pill status-${status}`}><Icon size={14} />{statusLabel(language, status)}</span>;
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => { try { return localStorage.getItem('nothisetu-language') === 'bn' ? 'bn' : 'en'; } catch { return 'en'; } });
  const [data, setData] = useState<RequirementsData | null>(null);
  const [files, setFiles] = useState<UploadedPdf[]>([]);
  const [assignments, setAssignments] = useState<AssignmentState>({ matches: {}, expiries: {} });
  const [includeIndex, setIncludeIndex] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<PreviewState>(null);
  const [generated, setGenerated] = useState<GeneratedState>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'ready'>('all');
  const [previousMatches, setPreviousMatches] = useState<AssignmentState['matches'] | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const uploadLock = useRef(false);
  const previewClose = useRef<HTMLButtonElement>(null);
  const l = (en: string, bn: string) => language === 'bn' ? bn : en;
  const requirementsInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);

  useEffect(() => { try { localStorage.setItem('nothisetu-language', language); } catch { /* Storage is optional. */ } document.documentElement.lang = language; }, [language]);
  useEffect(() => {
    if (!preview) return;
    const opener = document.activeElement as HTMLElement | null;
    previewClose.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview();
      if (event.key === 'Tab') { event.preventDefault(); previewClose.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [preview]);
  useEffect(() => () => {
    if (preview?.temporary) URL.revokeObjectURL(preview.url);
  }, [preview]);
  useEffect(() => () => {
    if (generated) URL.revokeObjectURL(generated.url);
  }, [generated]);

  const rows = useMemo(() => data?.requirements.map((requirement) => ({
    requirement,
    fileId: assignments.matches[requirement.id],
    expiry: assignments.expiries[requirement.id],
    status: getRequirementStatus(
      requirement,
      assignments.matches[requirement.id],
      assignments.expiries[requirement.id],
      data.tender.submission_deadline,
    ),
  })) ?? [], [data, assignments]);
  const blockers = rows.filter((row) => isBlockingStatus(row.status));
  const readyCount = rows.length - blockers.length;
  const progress = rows.length ? Math.round((readyCount / rows.length) * 100) : 0;
  const duplicateHashes = useMemo(() => getDuplicateHashes(files), [files]);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  const visibleRows = rows.filter((row) => (filter === 'all' || (filter === 'attention' ? isBlockingStatus(row.status) : !isBlockingStatus(row.status))) && `${row.requirement.title_en} ${row.requirement.title_bn} ${files.find((file) => file.id === row.fileId)?.name ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function clearGenerated() {
    setGenerated((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setNotice('');
  }

  function closePreview() {
    setPreview((current) => {
      if (current?.temporary) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function resetWorkspace() {
    if (uploadLock.current || generating || demoLoading) return;
    if (data && !window.confirm(l('Clear this workspace and start a new tender?', 'এই কর্মক্ষেত্র মুছে নতুন টেন্ডার শুরু করবেন?'))) return;
    setPreviousMatches(null); setQuery(''); setFilter('all');
    closePreview();
    clearGenerated();
    setData(null); setFiles([]); setAssignments({ matches: {}, expiries: {} }); setErrors([]); setNotice('');
    if (requirementsInput.current) requirementsInput.current.value = '';
    if (pdfInput.current) pdfInput.current.value = '';
  }

  async function loadRequirements(file: File) {
    if (uploadLock.current || generating || demoLoading) return;
    try {
      if (data && !window.confirm(t(language, 'confirmReplace'))) return;
      const parsed = parseRequirements(JSON.parse(await file.text()));
      closePreview(); clearGenerated();
      setPreviousMatches(null); setQuery(''); setFilter('all');
      setData(parsed); setFiles([]); setAssignments({ matches: {}, expiries: {} }); setErrors([]); setNotice('');
      if (pdfInput.current) pdfInput.current.value = '';
    } catch (error) {
      setErrors([`${t(language, 'invalidJson')} ${error instanceof Error ? error.message : ''}`.trim()]);
    }
  }

  async function handleRequirementsChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await loadRequirements(file);
    event.target.value = '';
  }

  async function processFiles(selected: File[]) {
    if (!selected.length || uploadLock.current || generating) return;
    uploadLock.current = true;
    clearGenerated(); setPreviousMatches(null);
    setProcessing(true); setErrors([]); setNotice('');
    const newFiles: UploadedPdf[] = [];
    const newErrors: string[] = [];
    let count = files.length;
    let bytesTotal = totalSize;
    for (const file of selected) {
      if (count >= MAX_FILES) { newErrors.push(`${file.name}: ${l('Maximum of 30 PDFs reached.', 'সর্বোচ্চ ৩০টি PDF যোগ করা যাবে।')}`); continue; }
      if (bytesTotal + file.size > MAX_BYTES) { newErrors.push(`${file.name}: ${l('The 50 MB total limit would be exceeded.', 'মোট ৫০ MB সীমা অতিক্রম করবে।')}`); continue; }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const signature = new TextDecoder('ascii').decode(bytes.slice(0, 5));
        if (signature !== '%PDF-') throw new Error(l('Not a valid PDF file.', 'বৈধ PDF ফাইল নয়।'));
        const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
        const pages = pdf.getPageCount();
        if (!pages) throw new Error(l('This PDF has no pages.', 'এই PDF-এ কোনো পৃষ্ঠা নেই।'));
        const hash = await sha256(bytes);
        newFiles.push({ id: crypto.randomUUID(), name: file.name, size: file.size, pages, hash, bytes });
        count += 1; bytesTotal += file.size;
      } catch (error) {
        const detail = error instanceof Error && /encrypt|password/i.test(error.message)
          ? l('Password-protected PDFs are not supported.', 'পাসওয়ার্ড সুরক্ষিত PDF সমর্থিত নয়।')
          : error instanceof Error ? error.message : 'This PDF could not be read.';
        newErrors.push(`${file.name}: ${detail}`);
      }
    }
    if (newFiles.length) setFiles((current) => [...current, ...newFiles]);
    setErrors(newErrors); setProcessing(false); uploadLock.current = false;
    if (pdfInput.current) pdfInput.current.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    void processFiles(Array.from(event.dataTransfer.files));
  }

  function removeFile(fileId: string) {
    if (uploadLock.current || generating) return;
    setPreviousMatches(null);
    setFiles((current) => current.filter((file) => file.id !== fileId));
    setAssignments((current) => {
      const matches = { ...current.matches };
      const expiries = { ...current.expiries };
      Object.entries(matches).forEach(([requirementId, matchedFileId]) => {
        if (matchedFileId === fileId) { delete matches[requirementId]; delete expiries[requirementId]; }
      });
      return { matches, expiries };
    });
    clearGenerated();
  }

  function changeMatch(requirementId: string, fileId: string) {
    setPreviousMatches(null);
    if (fileId && !canAssignFile(requirementId, fileId, files, assignments.matches)) return;
    setAssignments((current) => ({
      matches: { ...current.matches, [requirementId]: fileId || undefined },
      expiries: { ...current.expiries, [requirementId]: undefined },
    }));
    clearGenerated();
  }

  function changeExpiry(requirementId: string, value: string) {
    setAssignments((current) => ({ ...current, expiries: { ...current.expiries, [requirementId]: value } }));
    clearGenerated();
  }

  function previewFile(file: UploadedPdf) {
    closePreview();
    const url = URL.createObjectURL(blobFromBytes(file.bytes, 'application/pdf'));
    setPreview({ url, title: file.name, temporary: true });
  }

  function applySuggestions() {
    if (!data) return;
    const matches = suggestAssignments(data.requirements, files, assignments.matches);
    const count = Object.keys(matches).filter((id) => matches[id] !== assignments.matches[id]).length;
    setPreviousMatches(count ? assignments.matches : null);
    setAssignments((current) => ({ ...current, matches }));
    clearGenerated(); setNotice(count ? `${count} ${l('new matches suggested. Review the files and enter expiry dates.', 'টি নতুন মিল দেওয়া হয়েছে। ফাইল যাচাই করে মেয়াদ লিখুন।')}` : l('No confident new matches. Please assign unnamed scans manually.', 'নতুন নির্ভরযোগ্য মিল নেই। নামহীন স্ক্যান নিজে মিলিয়ে দিন।'));
  }

  async function loadDemo() {
    if (processing || generating || demoLoading || data) return;
    setDemoLoading(true); setErrors([]);
    try {
      const [requirementsResponse, manifestResponse] = await Promise.all([fetch('/demo/requirements.json'), fetch('/demo/manifest.json')]);
      if (!requirementsResponse.ok || !manifestResponse.ok) throw new Error('Sample unavailable');
      const parsed = parseRequirements(await requirementsResponse.json());
      const names: string[] = await manifestResponse.json();
      const demoFiles = await Promise.all(names.map(async (name) => {
        const response = await fetch(`/demo/documents/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error('Sample document unavailable');
        return new File([await response.blob()], name, { type: 'application/pdf' });
      }));
      setData(parsed); setAssignments({ matches: {}, expiries: {} });
      await processFiles(demoFiles);
      setNotice(l('Official sample loaded. Suggest matches, review the scan, and enter the document expiry dates.', 'নমুনা লোড হয়েছে। সম্ভাব্য মিল দিন, স্ক্যান যাচাই করুন এবং নথির মেয়াদ লিখুন।'));
    } catch { setErrors([l('Could not load the sample. You can still choose your own JSON and PDFs.', 'নমুনা লোড হয়নি। আপনার JSON এবং PDF নির্বাচন করুন।')]); }
    finally { setDemoLoading(false); }
  }

  async function generatePackage() {
    if (!data || blockers.length || processing) return;
    setGenerating(true); setErrors([]); setNotice('');
    try {
      const result = await createTenderPackage({ data, files, assignments, includeIndex, madeOn: localDate() });
      clearGenerated();
      const url = URL.createObjectURL(blobFromBytes(result.bytes, 'application/pdf'));
      setGenerated({ url, fileName: result.fileName, pageCount: result.pageCount });
      setNotice(t(language, 'packageCreated'));
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'The PDF package could not be generated.']);
    } finally { setGenerating(false); }
  }

  function exportCsv() {
    if (!data) return;
    const header = ['Document', 'File name', 'Pages', 'Expiry date', 'Status'];
    const csvRows = rows.map((row) => {
      const file = files.find((candidate) => candidate.id === row.fileId);
      return [language === 'bn' ? row.requirement.title_bn : row.requirement.title_en, file?.name ?? '', file?.pages ?? '', row.expiry ?? '', statusLabel(language, row.status)];
    });
    const csv = '\uFEFF' + [header, ...csvRows].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${data.tender.tender_id}_Checklist.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const activeStep = !data ? 1 : blockers.length ? 2 : 3;

  return <div className="app-shell" lang={language === 'bn' ? 'bn' : 'en'}>
    <svg className="decorative-blob blob-mint" viewBox="0 0 320 280" aria-hidden="true"><path d="M51 51C97 5 184 0 252 32c68 32 79 106 42 165-37 59-119 91-189 70-70-21-111-84-90-141 8-24 18-51 36-75Z" /></svg>
    <svg className="decorative-blob blob-pink" viewBox="0 0 300 260" aria-hidden="true"><path d="M34 70C70 15 149-7 216 21c67 28 99 99 69 157-30 58-123 91-190 70C28 227-18 150 8 99c7-14 16-24 26-29Z" /></svg>
    <svg className="decorative-blob blob-yellow" viewBox="0 0 240 220" aria-hidden="true"><path d="M29 55C63 9 140-6 192 28c52 34 60 105 22 151-38 46-116 53-168 18C-6 162-7 105 29 55Z" /></svg>
    <aside className="sidebar">
      <a className="brand-mark" href="#workspace" aria-label="NothiSetu home"><span className="brand-logo"><img src="/nothisetu-logo.png" alt="NothiSetu — Tender Package Studio" /></span></a>
      <nav aria-label="Primary navigation">
        <a className="nav-item active" href="#workspace"><LayoutDashboard size={18} />{t(language, 'workspace')}</a>
        <a className="nav-item" href="#library"><Archive size={18} />{t(language, 'documents')}<span className="nav-count">{files.length}</span></a>
        <a className="nav-item" href="#package"><PackageCheck size={18} />{t(language, 'package')}</a>
      </nav>
      <div className="privacy-note"><ShieldCheck size={20} /><span>{t(language, 'privateNote')}</span></div>
    </aside>

    <main id="workspace" aria-busy={processing || generating || demoLoading} inert={generating || !!preview ? true : undefined}>
      <header className="topbar">
        <div><span className="eyebrow">{data?.tender.tender_id ?? 'AI DEVFEST 2026'}</span><h1>{data ? data.tender.title : t(language, 'tagline')}</h1></div>
        <div className="top-actions">
          <button className="language-button" onClick={() => setLanguage((current) => current === 'en' ? 'bn' : 'en')}><Languages size={17} />{t(language, 'language')}</button>
          {(data || files.length > 0) && <button className="icon-button" aria-label={t(language, 'reset')} title={t(language, 'reset')} onClick={resetWorkspace}><RefreshCcw size={18} /></button>}
        </div>
      </header>

      <section className={`hero ${data ? 'compact' : ''}`}>
        <div className="hero-copy">
          <span className="hero-kicker"><span className="live-dot" />{l("A little order. A lot of confidence.", "গোছানো নথি। আত্মবিশ্বাসী জমাদান।")}</span>
          <h2>{data ? t(language, 'requirements') : t(language, 'noTenderTitle')}</h2>
          <p>{data ? t(language, 'requirementHint') : t(language, 'noTenderBody')}</p>
          {!data && <div className="hero-actions"><button className="primary-button" disabled={demoLoading} onClick={() => requirementsInput.current?.click()}><FolderOpen size={18} />{l('Start your package', 'প্যাকেজ শুরু করুন')}<ArrowUpRight size={17} /></button><button className="demo-button" disabled={demoLoading} onClick={() => void loadDemo()}>{demoLoading ? <LoaderCircle className="spin" size={16} /> : <FlaskConical size={16} />}{l('Try the sample', 'নমুনা দেখুন')}</button></div>}
          <div className="hero-footnote"><LockKeyhole size={13} />{l('No uploads. No sign-up. Just your browser.', 'আপলোড নয়। নিবন্ধন নয়। শুধু আপনার ব্রাউজার।')}</div>
        </div>
        <div className="paper-scene" aria-hidden="true"><div className="paper back"></div><div className="paper middle"></div><div className="paper front"><span></span><span></span><span></span><span className="paper-check"><Check size={22} /></span></div><div className="spark one">✦</div><div className="spark two">✦</div><span className="paper-caption">{l("From scattered to submitted.", "এলোমেলো থেকে গোছানো।")}</span></div>
      </section>

      <section className="steps" aria-label="Workflow progress">
        {[t(language, 'step1'), t(language, 'step2'), t(language, 'step3')].map((label, index) => {
          const step = index + 1; const complete = step < activeStep;
          return <div className={`step ${step === activeStep ? 'active' : ''} ${complete ? 'complete' : ''}`} key={label}><span>{complete ? <Check size={15} /> : step}</span><strong>{label}</strong></div>;
        })}
      </section>

      {data && <section className="top-progress-card" aria-label={t(language, 'readiness')}>
        <div className="progress-copy"><span>{t(language, 'readiness')}</span><strong>{progress}%</strong><small>{language === 'bn' ? 'সম্পন্ন' : 'Completed'}</small></div>
        <div className="top-progress-detail"><div><strong>{readyCount} / {rows.length}</strong><span>{language === 'bn' ? 'নথি পরীক্ষায় উত্তীর্ণ' : 'documents cleared'}</span></div><div className="outlined-progress"><span style={{ width: `${progress}%` }} /></div></div>
        <div className={`progress-sticker ${blockers.length ? 'needs-work' : 'complete'}`}>{blockers.length ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}{blockers.length ? `${blockers.length} ${language === 'bn' ? 'টি বাকি' : 'to resolve'}` : t(language, 'ready')}</div>
      </section>}

      <input ref={requirementsInput} hidden type="file" accept="application/json,.json" onChange={handleRequirementsChange} />
      <input ref={pdfInput} hidden multiple type="file" accept="application/pdf,.pdf" onChange={(event) => void processFiles(Array.from(event.target.files ?? []))} />

      {errors.length > 0 && <section className="alert-card" role="alert"><AlertTriangle size={19} /><div><strong>{t(language, 'fileErrors')}</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div><button onClick={() => setErrors([])} aria-label={t(language, 'close')}><X size={17} /></button></section>}
      {notice && <div className="notice-card" role="status"><CheckCircle2 size={17} /><span>{notice}</span>{previousMatches && <button className="text-button" onClick={() => { setAssignments((current) => ({ ...current, matches: previousMatches })); setPreviousMatches(null); clearGenerated(); }}><Undo2 size={14} />{l('Undo', 'ফিরিয়ে নিন')}</button>}<button className="notice-close" aria-label={t(language, 'close')} onClick={() => setNotice('')}><X size={15} /></button></div>}

      {data && <section className="tender-overview">
        <div className="overview-heading"><div className="icon-tile"><FileCheck2 /></div><div><span>{t(language, 'tenderReady')}</span><strong>{data.tender.tender_id}</strong></div></div>
        <dl><div><dt>{t(language, 'procuringEntity')}</dt><dd>{data.tender.procuring_entity}</dd></div><div><dt>{t(language, 'bidder')}</dt><dd>{data.tender.bidder}</dd></div><div><dt>{t(language, 'deadline')}</dt><dd>{data.tender.submission_deadline}</dd></div></dl>
        <button className="text-button" onClick={() => requirementsInput.current?.click()}><FileJson2 size={15} />{t(language, 'replaceJson')}</button>
      </section>}

      <div className="workspace-grid">
        <section className="content-column">
          {data ? <div className="section-card checklist-card">
            <div className="section-heading"><div><span className="section-kicker">{data.requirements.length} {l('documents to review', 'টি নথি যাচাই করুন')}</span><h3>{t(language, 'requirements')}</h3><p>{t(language, 'requirementHint')}</p></div>{files.length > 0 && <button className="secondary-button match-button" disabled={processing} onClick={applySuggestions}><Wand2 size={16} />{t(language, 'suggestMatches')}</button>}</div>
            <div className="checklist-toolbar"><label className="search-field"><Search size={15} /><input aria-label={l('Search documents', 'নথি খুঁজুন')} placeholder={l('Find a document…', 'নথি খুঁজুন…')} value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="filter-tabs">{(['all', 'attention', 'ready'] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? l('All', 'সব') : value === 'attention' ? l('To resolve', 'বাকি') : l('Cleared', 'সম্পন্ন')}</button>)}</div></div>
            <div className="requirement-list">
              {!visibleRows.length && <div className="filter-empty"><Search size={24} /><p>{l('No documents in this view.', 'এই তালিকায় কোনো নথি নেই।')}</p><button className="text-button" onClick={() => { setFilter('all'); setQuery(''); }}>{l('Show all documents', 'সব নথি দেখুন')}</button></div>}
              {visibleRows.map(({ requirement, fileId, expiry, status }, index) => {
                const matched = files.find((file) => file.id === fileId);
                return <article className={`requirement-row row-${status}`} key={requirement.id}>
                  <div className="order-badge">{String(requirement.order).padStart(2, '0')}</div>
                  <div className="requirement-content">
                    <div className="requirement-title"><div><h4>{language === 'bn' ? requirement.title_bn : requirement.title_en}</h4><span>{language === 'bn' ? requirement.title_en : requirement.title_bn}</span></div><div className="tags"><span className={requirement.mandatory ? 'tag required' : 'tag optional'}>{requirement.mandatory ? t(language, 'required') : t(language, 'optional')}</span>{requirement.has_expiry && <span className="tag expiry"><Clock3 size={12} />{t(language, 'expires')}</span>}</div></div>
                    <div className="controls-grid">
                      <label><span>{t(language, 'matchedFile')}</span><select value={fileId ?? ''} onChange={(event) => changeMatch(requirement.id, event.target.value)}><option value="">{t(language, 'chooseFile')}</option>{files.map((file) => <option key={file.id} value={file.id} disabled={file.id !== fileId && !canAssignFile(requirement.id, file.id, files, assignments.matches)}>{file.name} · {file.pages} {file.pages === 1 ? t(language, 'page') : t(language, 'pages')}</option>)}</select></label>
                      {requirement.has_expiry && fileId && <label><span>{t(language, 'expiryDate')}</span><input type="date" value={expiry ?? ''} onChange={(event) => changeExpiry(requirement.id, event.target.value)} /></label>}
                      {matched && <button className="preview-button" onClick={() => previewFile(matched)}><Eye size={15} />{t(language, 'preview')}</button>}
                    </div>
                    {matched && <div className="match-evidence"><ScanLine size={12} />{matchScore(matched.name, requirement.title_en, requirement.title_bn) >= .8 ? l('Strong filename match · verify contents', 'নামে ভালো মিল · বিষয়বস্তু যাচাই করুন') : l('Manually assigned · verify contents', 'নিজে মেলানো · বিষয়বস্তু যাচাই করুন')}{requirement.has_expiry && <span>{l('Valid through', 'বৈধ থাকতে হবে')} {data.tender.submission_deadline}</span>}</div>}
                  </div>
                  <StatusPill status={status} language={language} />
                  <span className="row-connector" aria-hidden="true">{index < rows.length - 1 && ''}</span>
                </article>;
              })}
            </div>
          </div> : <div className="section-card empty-workspace"><span className="section-kicker">{l("YOUR NEXT GREAT SUBMISSION", "আপনার পরবর্তী জমাদান")}</span><FileJson2 size={30} /><h3>{t(language, 'loadTender')}</h3><p>{t(language, 'loadHint')}</p><button className="secondary-button" onClick={() => requirementsInput.current?.click()}><Plus size={17} />{t(language, 'chooseJson')}</button><div className="engine-facts"><span><Wand2 size={15} />{matcherStats.categories} {l('document categories', 'ধরনের নথি')}</span><span><Languages size={15} />English + বাংলা</span><span><ShieldCheck size={15} />{l('Duplicate detection', 'নকল শনাক্তকরণ')}</span></div></div>}

          <div id="library" className="section-card library-card">
            <div className="section-heading"><div><span className="section-kicker">{files.length} / {MAX_FILES} · {formatBytes(totalSize)} / 50 MB</span><h3>{t(language, 'uploadedFiles')}</h3></div>{files.length > 0 && data && <button className="text-button" onClick={exportCsv}><FileDown size={15} />{t(language, 'exportCsv')}</button>}</div>
            {files.length === 0 ? <div className="library-empty"><HardDrive size={25} /><span>{t(language, 'noFiles')}</span></div> : <div className="file-grid">{files.map((file) => {
              const assigned = data?.requirements.find((requirement) => assignments.matches[requirement.id] === file.id);
              return <article className="file-card" key={file.id}><div className="file-icon"><FileText size={21} /></div><div className="file-copy"><strong title={file.name}>{file.name}</strong><span>{file.pages} {file.pages === 1 ? t(language, 'page') : t(language, 'pages')} · {formatBytes(file.size)}</span>{assigned && <small>{t(language, 'assignedTo')}: {language === 'bn' ? assigned.title_bn : assigned.title_en}</small>}{duplicateHashes.has(file.hash) && <em><AlertTriangle size={12} />{t(language, 'duplicate')}</em>}</div><div className="file-actions"><button onClick={() => previewFile(file)} aria-label={`${t(language, 'preview')} ${file.name}`}><Eye size={16} /></button><button onClick={() => removeFile(file.id)} aria-label={`${t(language, 'remove')} ${file.name}`}><Trash2 size={16} /></button></div></article>;
            })}</div>}
          </div>
        </section>

        <aside className="action-column">
          <section className="section-card upload-card">
            <div className="mini-heading"><Plus size={18} /><div><strong>{t(language, 'addFiles')}</strong><span>{t(language, 'allLocal')}</span></div></div>
            <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => !processing && pdfInput.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !processing) { event.preventDefault(); pdfInput.current?.click(); } }}>
              {processing ? <LoaderCircle className="spin" size={29} /> : <UploadCloud size={29} />}<strong>{processing ? t(language, 'processing') : t(language, 'dropTitle')}</strong><span>{t(language, 'dropHint')}</span><b>{t(language, 'browsePdfs')}</b>
            </div>
          </section>

          <section id="package" className={`section-card readiness-card ${progress === 100 && rows.length ? 'is-ready' : ''}`}>
            <div className="readiness-top"><div><span className="section-kicker">{t(language, 'readiness')}</span><h3>{progress === 100 && rows.length ? t(language, 'ready') : t(language, 'blockers')}</h3></div><div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><span>{progress}<small>%</small></span></div></div>
            <div className="progress-track"><span style={{ width: `${progress}%` }}></span></div>
            {data ? blockers.length ? <ul className="blocker-list">{blockers.slice(0, 5).map(({ requirement, status }) => <li key={requirement.id}><CircleAlert size={15} /><span>{language === 'bn' ? requirement.title_bn : requirement.title_en}</span><small>{statusLabel(language, status)}</small></li>)}{blockers.length > 5 && <li className="more-blockers">+{blockers.length - 5} {l('more', 'টি আরও')}</li>}</ul> : <div className="ready-message"><CheckCircle2 size={20} /><span>{t(language, 'noBlockers')}</span></div> : <div className="ready-message muted"><LockKeyhole size={19} /><span>{t(language, 'loadHint')}</span></div>}
            <label className="index-toggle"><input type="checkbox" checked={includeIndex} onChange={(event) => { setIncludeIndex(event.target.checked); clearGenerated(); }} /><span><span className="fake-check"><Check size={13} /></span><ListChecks size={16} />{t(language, 'includeIndex')}</span></label>
            <button data-testid="generate" className="generate-button" disabled={!data || blockers.length > 0 || processing || generating} onClick={() => void generatePackage()}>{generating ? <LoaderCircle className="spin" size={18} /> : <PackageCheck size={18} />}{generating ? t(language, 'generating') : t(language, 'generate')}</button>
            {generated && <div className="generated-actions"><div><FileCheck2 size={19} /><span><strong>{generated.fileName}</strong><small>{generated.pageCount} {t(language, 'pages')}</small></span></div><div><button onClick={() => setPreview({ url: generated.url, title: generated.fileName, temporary: false })}><Eye size={15} />{t(language, 'previewPackage')}</button><a href={generated.url} download={generated.fileName}><Download size={15} />{t(language, 'download')}</a></div></div>}
          </section>
        </aside>
      </div>

      <footer><span><ShieldCheck size={15} />{t(language, 'allLocal')}</span><span>NothiSetu · AI DevFest 2026</span></footer>
    </main>

    {preview && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={preview.title}><div className="preview-modal"><header><div><FileText size={18} /><strong>{preview.title}</strong></div><button ref={previewClose} onClick={closePreview} aria-label={t(language, 'close')}><X size={20} /></button></header><iframe src={preview.url} title={preview.title} /></div></div>}
  </div>;
}
