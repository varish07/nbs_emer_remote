import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Loader2, ArrowRight, Phone, ShieldCheck } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function GoogleIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.09-1.92 3.28-4.74 3.28-8.07z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

export default function Login() {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [mockOtp, setMockOtp] = useState("");
  const { login } = useAuth();
  const nav = useNavigate();

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) return toast.error("Please enter a valid phone number");
    const e164 = `+${digits}`;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phone: e164 });
      setMockOtp(data.mock_otp || "");
      setStep("otp");
      toast.success(data.mock ? "OTP sent! (Demo: use 123456)" : "OTP sent via SMS");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to send OTP");
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (otp.length < 4) return toast.error("Enter the 6-digit OTP");
    const digits = phone.replace(/\D/g, "");
    const e164 = `+${digits}`;
    setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone: e164, otp });
      login(data.token, data.user);
      toast.success("Welcome to NBS");
      nav("/", { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Invalid OTP");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f9] flex items-stretch justify-center">
      <div className="w-full max-w-md bg-white min-h-screen relative page-in">
        {/* Hero */}
        <div className="relative overflow-hidden">
          <div className="h-72 bg-gradient-to-br from-[#FFEBEE] via-white to-[#E0F2F1]" />
          <div className="absolute inset-0 flex flex-col items-start justify-end p-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur border border-[#EBEBEB] text-xs text-[#717171] mb-3">
              <span className="w-2 h-2 rounded-full bg-[#31A24C] online-dot" /> Live nearby network
            </div>
            <h1 className="font-display text-5xl font-bold text-[#222] leading-none">NBS</h1>
            <p className="text-[#717171] mt-2 max-w-xs">Meet, chat & connect with people near you. Activate yourself, set a radius, and discover who&apos;s around.</p>
          </div>
        </div>

        <div className="px-6 py-8">
          {step === "phone" ? (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#222]">Log in or sign up</h2>
                <p className="text-sm text-[#717171] mt-1">We&apos;ll send a one-time code to your phone.</p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-[#717171] font-bold">Mobile number</label>
                <div className="mt-2 flex items-center border-b-2 border-[#EBEBEB] focus-within:border-[#FF385C] transition-colors">
                  <Phone size={18} className="text-[#717171] mr-3" />
                  <span className="text-xl text-[#222] font-medium select-none" data-testid="login-phone-prefix">+</span>
                  <input
                    data-testid="login-phone-input"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="91 98765 43210"
                    className="flex-1 py-3 pl-1 text-xl tracking-wide outline-none bg-transparent text-[#222]"
                  />
                </div>
                <p className="text-[10px] text-[#717171] mt-2">Include country code (e.g. 91 for India, 1 for US).</p>
              </div>
              <button
                data-testid="login-send-otp-button"
                onClick={sendOtp}
                disabled={loading}
                className="w-full bg-[#FF385C] hover:bg-[#E31C5F] active:scale-[0.98] transition text-white rounded-xl py-4 font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#FF385C]/20 disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <>Send OTP <ArrowRight size={18} /></>}
              </button>

              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-[#EBEBEB]" />
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#9CA3AF] font-bold">or</span>
                <div className="flex-1 h-px bg-[#EBEBEB]" />
              </div>

              <button
                data-testid="login-google-button"
                onClick={() => {
                  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
                  const redirectUrl = window.location.origin + "/auth/callback";
                  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
                }}
                className="w-full bg-white border border-[#EBEBEB] hover:bg-[#F7F7F9] active:scale-[0.98] transition text-[#222] rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2"
              >
                <GoogleIcon size={18} /> Continue with Google
              </button>

              <p className="text-xs text-[#717171] text-center">By continuing you agree to NBS Terms & Privacy.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#222]">Enter verification code</h2>
                <p className="text-sm text-[#717171] mt-1">Sent to <span className="text-[#222] font-medium">+{phone}</span></p>
                {mockOtp && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFEBEE] text-[#C13515] text-xs font-medium" data-testid="mock-otp-hint">
                    <ShieldCheck size={14} /> Demo OTP: {mockOtp}
                  </div>
                )}
              </div>
              <div>
                <input
                  data-testid="otp-input-field"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full text-center text-3xl tracking-[0.6em] py-4 border-b-2 border-[#EBEBEB] focus:border-[#FF385C] outline-none transition-colors bg-transparent"
                />
              </div>
              <button
                data-testid="verify-otp-button"
                onClick={verifyOtp}
                disabled={loading}
                className="w-full bg-[#FF385C] hover:bg-[#E31C5F] active:scale-[0.98] transition text-white rounded-xl py-4 font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#FF385C]/20 disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <>Verify & Continue <ArrowRight size={18} /></>}
              </button>
              <button
                data-testid="login-back-button"
                onClick={() => { setStep("phone"); setOtp(""); }}
                className="w-full text-sm text-[#717171] hover:text-[#222] transition"
              >
                ← Change number
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
