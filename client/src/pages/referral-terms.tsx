import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function ReferralTerms() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-blue-900 text-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/referrals">
            <Button variant="ghost" size="icon" className="text-white hover:bg-blue-800" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Referral Program Terms</h1>
        </div>
      </div>

      <div className="p-5 max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow">
          <h2 className="text-xl font-bold mb-4" data-testid="text-terms-title">Referral Program Terms</h2>
          
          <ul className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex gap-2">
              <span className="text-gray-400">1.</span>
              <span>Referral commissions are paid for marketing and awareness services only.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gray-400">2.</span>
              <span>WorkAbroad Hub does not sell jobs, visas, or employment guarantees.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gray-400">3.</span>
              <span>Referrers must not promise jobs, visas, or guaranteed outcomes.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gray-400">4.</span>
              <span>Commission is earned only after a referred user completes payment successfully.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gray-400">5.</span>
              <span>Commission is one-time per referral and non-recurring.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gray-400">6.</span>
              <span>Any misleading promotion may result in termination of referral privileges without payout.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gray-400">7.</span>
              <span>Payouts are processed manually after verification.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-gray-400">8.</span>
              <span>Participation in the referral program does not constitute employment or partnership.</span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-6 px-2">
          By participating in the referral program, you agree to these terms.
        </p>
      </div>
    </div>
  );
}
