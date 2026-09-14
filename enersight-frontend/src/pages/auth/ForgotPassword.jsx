import React from "react";
import { ArrowLeft, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import AuthShell from "../../components/ui/AuthShell";

/**
 * Honest replacement for the previous stub.
 *
 * The old page collected a username and, on submit, always printed "Password reset
 * is not available yet." It made no network call of any kind: the input, the
 * validation and the Submit button were all theatre, and a "Prototype note" card
 * underneath admitted it.
 *
 * Self-service reset needs something the system does not have — a verified email
 * address per user, an outbound mail path, and single-use expiring tokens. Rather
 * than keep a form that cannot work, this page now tells the user exactly what to
 * do instead. An administrator can already set any user's password from the Users
 * page, and every user can change their own from Settings.
 */
const ForgotPassword = ({ onBack }) => {
  return (
    <AuthShell
      title="Password help"
      subtitle="Account passwords are reset by your administrator."
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
      >
        <ArrowLeft size={18} />
        Back to login
      </button>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-700 text-white">
            <UserCog size={21} />
          </div>

          <p className="text-sm font-semibold text-slate-950">
            Ask your administrator
          </p>
          <p className="mt-1 text-sm font-normal leading-6 text-slate-600">
            Give them your username and they can set a new password for you from
            the Users page. You will be able to change it yourself afterwards.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-lime-300">
            <KeyRound size={21} />
          </div>

          <p className="text-sm font-semibold text-slate-950">
            If you can still sign in
          </p>
          <p className="mt-1 text-sm font-normal leading-6 text-slate-600">
            Change your password yourself from Settings. You will need your current
            password to set a new one.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" />
          <p className="text-xs font-normal leading-5 text-emerald-800">
            Email-based self-service reset is not offered because accounts are
            identified by username only. Adding it would require a verified email
            address per user and single-use expiring reset tokens.
          </p>
        </div>
      </div>
    </AuthShell>
  );
};

export default ForgotPassword;
