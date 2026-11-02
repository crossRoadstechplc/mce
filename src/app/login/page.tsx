import LoginForm from "./login-form";
import { otpMedium } from "@/lib/otp-medium";

export const metadata = { title: "Sign in · MCE Residential Feasibility" };

export default function LoginPage() {
  return (
    <main className="gate">
      <div className="card">
        <div className="brand">MCE Real Estate · Building B · Addis Ababa</div>
        <LoginForm medium={otpMedium()} />
        <div className="foot">© 2026 SPX. For authorised users only.</div>
      </div>
    </main>
  );
}
