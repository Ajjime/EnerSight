import API_BASE_URL from "../../config";
import React, { useState } from "react";
import {
  ArrowLeft,
  KeyRound,
  Send,
  ShieldAlert,
  User,
} from "lucide-react";
import AuthShell from "../../components/ui/AuthShell";
import { FormField } from "../../components/ui/EnergyUI";

const ForgotPassword = ({ onBack }) => {
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event) {
    event.preventDefault();

    if (!username.trim()) {
      setMessage("Please enter your username.");
      return;
    }

    setMessage(
      "Password reset is not available yet. Please contact the system administrator."
    );
  }

  return (
    <AuthShell
      title="Password help"
      subtitle="Enter your username to request password assistance."
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 text-sm font-black text-emerald-700 hover:text-emerald-800"
      >
        <ArrowLeft size={18} />
        Back to login
      </button>

      {message && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-black text-amber-700">
          <ShieldAlert size={19} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Username">
          <div className="relative">
            <div className="pointer-events-none absolute left-4 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-white text-emerald-700">
              <User size={18} />
            </div>

            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 pl-14 text-sm font-bold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white"
            />
          </div>
        </FormField>

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
        >
          Submit Request
          <Send size={18} />
        </button>
      </form>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-700 text-white">
          <KeyRound size={21} />
        </div>

        <p className="text-sm font-black text-slate-950">
          Prototype note
        </p>
        <p className="mt-1 text-sm font-bold leading-6 text-slate-500">
          Password recovery is prepared for future development. For now, the
          administrator manages account access from the Users page.
        </p>
      </div>
    </AuthShell>
  );
};

export default ForgotPassword;