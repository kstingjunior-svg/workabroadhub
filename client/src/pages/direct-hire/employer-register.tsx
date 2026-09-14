// /direct-hire/employer/register — overseas employer onboarding.
// Free to register and list jobs. Verification is admin-reviewed (no
// government registry of overseas employers exists to check against).
import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Building2, ShieldCheck } from "lucide-react";

export default function DirectHireEmployerRegister() {
  usePageSeo({ title: "Register as an Employer — Direct Hire Jobs | WorkAbroad Hub", description: "List overseas job openings for free and reach verified, job-ready Kenyan workers." });
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["/api/direct-hire/employer/me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/direct-hire/employer/me").catch(() => null);
      if (!res || !res.ok) return null;
      return res.json();
    },
  });

  useEffect(() => {
    if (existing) navigate("/direct-hire/employer/dashboard");
  }, [existing, navigate]);

  const [form, setForm] = useState({ companyName: "", country: "", contactEmail: "", contactPhone: "", website: "", sector: "", description: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/direct-hire/employer/register", form)).json(),
    onSuccess: () => {
      toast({ title: "Employer profile created", description: "You can post jobs now — they go live after a quick review." });
      navigate("/direct-hire/employer/dashboard");
    },
    onError: () => toast({ title: "Couldn't register", description: "Please check the required fields and try again.", variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="heading-employer-register">
          <Building2 className="h-5 w-5 text-primary" /> Register as an employer
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Free to register and post listings. Verification is manual — we review every employer profile before jobs go live.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Company details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="companyName">Company name *</Label>
            <Input id="companyName" value={form.companyName} onChange={set("companyName")} data-testid="input-company-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="country">Country *</Label>
              <Input id="country" value={form.country} onChange={set("country")} placeholder="e.g. UAE" data-testid="input-employer-country" />
            </div>
            <div>
              <Label htmlFor="sector">Sector</Label>
              <Input id="sector" value={form.sector} onChange={set("sector")} placeholder="e.g. Hospitality" data-testid="input-sector" />
            </div>
          </div>
          <div>
            <Label htmlFor="contactEmail">Contact email *</Label>
            <Input id="contactEmail" type="email" value={form.contactEmail} onChange={set("contactEmail")} data-testid="input-contact-email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contactPhone">Contact phone</Label>
              <Input id="contactPhone" value={form.contactPhone} onChange={set("contactPhone")} data-testid="input-contact-phone" />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={form.website} onChange={set("website")} placeholder="https://…" data-testid="input-website" />
            </div>
          </div>
          <div>
            <Label htmlFor="description">About the company</Label>
            <Textarea id="description" value={form.description} onChange={set("description")} rows={3} data-testid="textarea-description" />
          </div>

          <Button
            className="w-full gap-2"
            disabled={!form.companyName || !form.country || !form.contactEmail || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-submit-employer-register"
          >
            <ShieldCheck className="h-4 w-4" /> {mutation.isPending ? "Submitting…" : "Register employer"}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Already have an account? <Link href="/direct-hire/employer/dashboard" className="text-primary hover:underline">Go to your dashboard</Link>
      </p>
    </div>
  );
}
