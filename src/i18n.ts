import type { Language, RequirementStatus } from './engine';

const dictionary = {
  en: {
    appName: 'NothiSetu', tagline: 'Tender Package Studio', privateNote: 'Private by design · Files never leave this browser',
    workspace: 'Workspace', documents: 'Documents', package: 'Package', loadTender: 'Load tender requirements',
    loadHint: 'Choose the requirements.json supplied with the tender.', chooseJson: 'Choose JSON', replaceJson: 'Replace JSON',
    addFiles: 'Add tender documents', dropTitle: 'Drop PDF files here', dropHint: 'or browse up to 30 files · 50 MB total',
    browsePdfs: 'Browse PDFs', tenderReady: 'Tender loaded', deadline: 'Submission deadline', procuringEntity: 'Procuring entity',
    bidder: 'Bidder', requirements: 'Document checklist', requirementHint: 'Match one PDF to every required document.',
    required: 'Required', optional: 'Optional', expires: 'Expiry required', matchedFile: 'Matched file', chooseFile: 'Choose a PDF…',
    expiryDate: 'Expiry date', status: 'Status', preview: 'Preview', remove: 'Remove', pages: 'pages', page: 'page',
    uploadedFiles: 'Document library', noFiles: 'No PDFs added yet.', readiness: 'Package readiness', ready: 'Ready to package',
    blockers: 'Needs attention', generate: 'Generate package', generating: 'Building your package…', download: 'Download package',
    previewPackage: 'Preview package', includeIndex: 'Include index page', suggestMatches: 'Suggest matches', exportCsv: 'Export checklist CSV',
    reset: 'Start over', language: 'বাংলা', close: 'Close', duplicate: 'Exact duplicate', assignedTo: 'Assigned to', unassigned: 'Unassigned',
    processing: 'Inspecting files…', allLocal: 'Everything is processed locally in your browser.', noTenderTitle: 'Turn a folder of PDFs into a confident submission.',
    noTenderBody: 'Load the tender checklist, match every document, resolve issues, and export one submission-ready package.',
    step1: 'Load requirements', step2: 'Match documents', step3: 'Review & export', invalidJson: 'Could not load the requirements file.',
    fileErrors: 'Some files were not added', packageCreated: 'Package created successfully.', noBlockers: 'Every required document is ready.',
    autoMatched: 'Best filename matches applied. Please review them.', clearMatch: 'No file selected', replaceWarning: 'Loading another tender clears current files and matches.',
    confirmReplace: 'Load the new tender and clear this workspace?', cancel: 'Cancel', confirm: 'Continue',
    status_missing: 'Missing', status_expiry_needed: 'Expiry date needed', status_expired: 'Expired', status_not_provided: 'Not provided', status_ok: 'OK',
  },
  bn: {
    appName: 'নথিসেতু', tagline: 'টেন্ডার প্যাকেজ স্টুডিও', privateNote: 'নিরাপদ নকশা · ফাইল এই ব্রাউজার ছেড়ে যায় না',
    workspace: 'কর্মক্ষেত্র', documents: 'নথি', package: 'প্যাকেজ', loadTender: 'টেন্ডারের চাহিদা লোড করুন',
    loadHint: 'টেন্ডারের সাথে দেওয়া requirements.json নির্বাচন করুন।', chooseJson: 'JSON নির্বাচন', replaceJson: 'JSON বদলান',
    addFiles: 'টেন্ডার নথি যোগ করুন', dropTitle: 'PDF ফাইল এখানে ছাড়ুন', dropHint: 'অথবা সর্বোচ্চ ৩০টি ফাইল · মোট ৫০ MB',
    browsePdfs: 'PDF নির্বাচন', tenderReady: 'টেন্ডার লোড হয়েছে', deadline: 'জমাদানের শেষ তারিখ', procuringEntity: 'ক্রয়কারী প্রতিষ্ঠান',
    bidder: 'দরদাতা', requirements: 'নথির চেকলিস্ট', requirementHint: 'প্রতিটি প্রয়োজনীয় নথির সঙ্গে একটি PDF মিলান।',
    required: 'আবশ্যিক', optional: 'ঐচ্ছিক', expires: 'মেয়াদ দরকার', matchedFile: 'মিলানো ফাইল', chooseFile: 'একটি PDF বাছুন…',
    expiryDate: 'মেয়াদ শেষের তারিখ', status: 'অবস্থা', preview: 'দেখুন', remove: 'সরান', pages: 'পৃষ্ঠা', page: 'পৃষ্ঠা',
    uploadedFiles: 'নথি সংগ্রহ', noFiles: 'এখনও কোনো PDF যোগ হয়নি।', readiness: 'প্যাকেজ প্রস্তুতি', ready: 'প্যাকেজ তৈরির জন্য প্রস্তুত',
    blockers: 'মনোযোগ প্রয়োজন', generate: 'প্যাকেজ তৈরি করুন', generating: 'প্যাকেজ তৈরি হচ্ছে…', download: 'প্যাকেজ ডাউনলোড',
    previewPackage: 'প্যাকেজ দেখুন', includeIndex: 'সূচিপত্র যোগ করুন', suggestMatches: 'সম্ভাব্য মিল দিন', exportCsv: 'চেকলিস্ট CSV রপ্তানি',
    reset: 'নতুন করে শুরু', language: 'English', close: 'বন্ধ করুন', duplicate: 'হুবহু নকল', assignedTo: 'যার সঙ্গে মিলেছে', unassigned: 'মেলানো হয়নি',
    processing: 'ফাইল পরীক্ষা হচ্ছে…', allLocal: 'সবকিছু আপনার ব্রাউজারেই প্রক্রিয়া করা হয়।', noTenderTitle: 'PDF-এর ফোল্ডারকে নির্ভুল জমাদান প্যাকেজে রূপ দিন।',
    noTenderBody: 'টেন্ডার চেকলিস্ট লোড করুন, নথি মিলান, সমস্যা ঠিক করুন এবং জমাদানযোগ্য একটি প্যাকেজ তৈরি করুন।',
    step1: 'চাহিদা লোড', step2: 'নথি মিলান', step3: 'যাচাই ও রপ্তানি', invalidJson: 'চাহিদার ফাইলটি লোড করা যায়নি।',
    fileErrors: 'কিছু ফাইল যোগ করা যায়নি', packageCreated: 'প্যাকেজ সফলভাবে তৈরি হয়েছে।', noBlockers: 'সব আবশ্যিক নথি প্রস্তুত।',
    autoMatched: 'ফাইলের নাম অনুযায়ী সম্ভাব্য মিল দেওয়া হয়েছে। অনুগ্রহ করে যাচাই করুন।', clearMatch: 'কোনো ফাইল নির্বাচিত নয়', replaceWarning: 'নতুন টেন্ডার লোড করলে বর্তমান ফাইল ও মিল মুছে যাবে।',
    confirmReplace: 'নতুন টেন্ডার লোড করে কর্মক্ষেত্র পরিষ্কার করবেন?', cancel: 'বাতিল', confirm: 'চালিয়ে যান',
    status_missing: 'অনুপস্থিত', status_expiry_needed: 'মেয়াদের তারিখ প্রয়োজন', status_expired: 'মেয়াদোত্তীর্ণ', status_not_provided: 'দেওয়া হয়নি', status_ok: 'ঠিক আছে',
  },
} as const;

export type TranslationKey = keyof typeof dictionary.en;
export const t = (language: Language, key: TranslationKey): string => dictionary[language][key];

export function statusLabel(language: Language, status: RequirementStatus): string {
  const key = `status_${status.replace('-', '_')}` as TranslationKey;
  return t(language, key);
}
