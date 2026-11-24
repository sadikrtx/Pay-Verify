import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'একটি অপ্রত্যাশিত সমস্যা হয়েছে।';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        message = parsed.error.includes('Quota exceeded')
          ? 'আজকের Firestore ফ্রি কোটা শেষ হয়েছে। আগামীকাল পুনরায় চালু হবে।'
          : `ডেটাবেস ত্রুটি (${parsed.operationType || 'read'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h1 className="text-lg font-bold text-slate-900">কিছু একটা সমস্যা হয়েছে</h1>
            <p className="text-sm text-slate-600 leading-relaxed break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-xl transition-colors"
            >
              পুনরায় লোড করুন
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
