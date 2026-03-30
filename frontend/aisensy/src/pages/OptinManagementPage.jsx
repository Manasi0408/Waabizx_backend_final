import React, { useState } from "react";

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange?.(!checked)}
      className={`relative w-11 h-6 rounded-full shadow-inner transition-colors ${
        checked ? "bg-gradient-to-r from-sky-500 to-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

function ResponsePreview({ title, message }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 w-12 h-12 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
        <span className="text-sm">W</span>
      </div>
      <div className="flex-1">
        <div className="rounded-2xl bg-gray-200/80 border border-gray-200/60 px-4 py-3 shadow-sm">
          <div className="text-xs font-semibold text-gray-500">{title}</div>
          <div className="mt-1 text-xs leading-relaxed text-gray-700">{message}</div>
        </div>
      </div>
    </div>
  );
}

export default function OptinManagementPage() {
  const [marketingOptInEnabled, setMarketingOptInEnabled] = useState(true);
  const [aiCampaignOptOutEnabled, setAiCampaignOptOutEnabled] = useState(true);

  const [optOutKeyword, setOptOutKeyword] = useState("STOP");
  const [optInKeyword, setOptInKeyword] = useState("ALLOW");

  return (
    <div className="p-6 md:p-8 motion-enter">
      <div className="motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-8 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Opt-in Management</h2>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white/60 border border-gray-100/90 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-bold text-gray-900">Marketing Messaging Opt-in</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Enable opt-in for marketing messages so your customers can consent to future marketing broadcasts from this project.
                </p>
              </div>
              <Toggle
                checked={marketingOptInEnabled}
                onChange={setMarketingOptInEnabled}
                label="Marketing messaging opt-in toggle"
              />
            </div>
          </div>

          <div className="bg-white/60 border border-gray-100/90 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm md:text-base font-bold text-gray-900">AI Campaign Opt-out</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Configure opt-out behavior for AI campaigns so customers can stop receiving messages immediately.
                </p>
              </div>
              <Toggle
                checked={aiCampaignOptOutEnabled}
                onChange={setAiCampaignOptOutEnabled}
                label="AI campaign opt-out toggle"
              />
            </div>
          </div>

          <div className="bg-white/60 border border-gray-100/90 rounded-2xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section>
                <h3 className="text-sm md:text-base font-bold text-gray-900">Opt-out Keywords</h3>
                <p className="text-sm text-gray-600 mt-1">The user will block by opting out for these messages.</p>

                <div className="mt-4">
                  <div className="inline-flex items-center gap-2">
                    <span className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700">
                      {optOutKeyword}
                    </span>
                  </div>

                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm md:text-base font-bold text-gray-900">Opt-out Response</h3>
                </div>

                <p className="text-sm text-gray-600 mt-1">Send a customized response for opt-out for your users.</p>

                <div className="mt-4">
                  <ResponsePreview
                    title="Opt-out message"
                    message="You have been opted out of your future marketing messages. If you would like to receive messages again, reply APPLY above US/APPLY."
                  />
                </div>
              </section>
            </div>
          </div>

          <div className="bg-white/60 border border-gray-100/90 rounded-2xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section>
                <h3 className="text-sm md:text-base font-bold text-gray-900">Opt-in Keywords</h3>
                <p className="text-sm text-gray-600 mt-1">The user will opt-in by responding with this keyword.</p>

                <div className="mt-4">
                  <div className="inline-flex items-center gap-2">
                    <span className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700">
                      {optInKeyword}
                    </span>
                  </div>

                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm md:text-base font-bold text-gray-900">Opt-in Response</h3>
                </div>

                <p className="text-sm text-gray-600 mt-1">Send a customized opt-in response for your users.</p>

                <div className="mt-4">
                  <ResponsePreview
                    title="Opt-in message"
                    message="Thanks! You have been opted in for future marketing messages. You will now receive updates and notifications related to this project."
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

