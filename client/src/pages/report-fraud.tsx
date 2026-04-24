import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  ArrowLeft,
  AlertTriangle,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Search as SearchIcon,
  FileText,
  Loader2,
} from "lucide-react";

const incidentTypes = [
  { value: "job_scam", label: "Job Scam / Fake Job Offer" },
  { value: "payment_fraud", label: "Payment Fraud / Money Theft" },
  { value: "fake_documents", label: "Fake Documents / Certificates" },
  { value: "impersonation", label: "Impersonation / Identity Fraud" },
  { value: "other", label: "Other" },
];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  investigating: "bg-blue-100 text-blue-800",
  confirmed: "bg-red-100 text-red-800",
  rejected: "bg-gray-100 text-gray-800",
};

const statusIcons: Record<string, any> = {
  pending: Clock,
  investigating: SearchIcon,
  confirmed: CheckCircle,
  rejected: XCircle,
};

export default function ReportFraudPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("report");

  const [suspectedEntity, setSuspectedEntity] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [description, setDescription] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  const { data: myReports, isLoading: reportsLoading } = useQuery({
    queryKey: ["/api/fraud-reports/my"],
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/fraud-reports", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report Submitted", description: "Your fraud report has been submitted and will be reviewed." });
      setSuspectedEntity("");
      setIncidentType("");
      setDescription("");
      setPhoneNumber("");
      setPaymentReference("");
      setLicenseNumber("");
      queryClient.invalidateQueries({ queryKey: ["/api/fraud-reports/my"] });
      setTab("my-reports");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit report. Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspectedEntity || !incidentType || !description) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    submitMutation.mutate({
      suspectedEntity,
      incidentType,
      description,
      phoneNumber: phoneNumber || undefined,
      paymentReference: paymentReference || undefined,
      licenseNumber: licenseNumber || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" data-testid="report-fraud-page">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        </div>

        <div className="text-center mb-6">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-orange-500" />
          <h1 className="text-2xl font-bold" data-testid="text-title">Report Fraud</h1>
          <p className="text-muted-foreground mt-1">
            Help protect the community by reporting suspicious agencies, scams, or fraudulent activity
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="report" className="flex-1" data-testid="tab-report">
              <Send className="w-4 h-4 mr-1" /> Submit Report
            </TabsTrigger>
            <TabsTrigger value="my-reports" className="flex-1" data-testid="tab-my-reports">
              <FileText className="w-4 h-4 mr-1" /> My Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report">
            <Card>
              <CardContent className="p-4 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Suspected Agency / Entity Name *</label>
                    <Input
                      value={suspectedEntity}
                      onChange={(e) => setSuspectedEntity(e.target.value)}
                      placeholder="e.g. ABC Recruitment Limited"
                      data-testid="input-entity"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Incident Type *</label>
                    <Select value={incidentType} onValueChange={setIncidentType}>
                      <SelectTrigger data-testid="select-incident-type">
                        <SelectValue placeholder="Select type of incident" />
                      </SelectTrigger>
                      <SelectContent>
                        {incidentTypes.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Description of Incident *</label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what happened in detail..."
                      rows={4}
                      data-testid="input-description"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Phone Number Used</label>
                      <Input
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="e.g. +254712345678"
                        data-testid="input-phone"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">License Number</label>
                      <Input
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="e.g. RA/2025/01/01"
                        data-testid="input-license"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Payment Reference / M-Pesa Code</label>
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g. SJK2DKFJG3"
                      data-testid="input-payment-ref"
                    />
                  </div>

                  <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                    <p className="font-medium text-amber-700 dark:text-amber-300">Important:</p>
                    <p className="text-amber-600 dark:text-amber-400 mt-1">
                      Your identity is protected. Reports are reviewed by our compliance team. False or malicious reports may result in account restrictions.
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitMutation.isPending} data-testid="button-submit">
                    {submitMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                    ) : (
                      <><Send className="w-4 h-4 mr-2" /> Submit Fraud Report</>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="my-reports">
            {reportsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : !myReports || (Array.isArray(myReports) && myReports.length === 0) ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="font-semibold" data-testid="text-no-reports">No reports yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">You haven't submitted any fraud reports.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3" data-testid="reports-list">
                {(Array.isArray(myReports) ? myReports : []).map((report: any, idx: number) => {
                  const StatusIcon = statusIcons[report.status] || Clock;
                  return (
                    <Card key={report.id || idx} data-testid={`report-card-${idx}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm" data-testid={`text-report-entity-${idx}`}>{report.suspectedEntity}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {incidentTypes.find(t => t.value === report.incidentType)?.label || report.incidentType}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Submitted: {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : "N/A"}
                            </p>
                            {report.resolution && (
                              <p className="text-xs mt-2 p-2 bg-muted rounded">{report.resolution}</p>
                            )}
                          </div>
                          <Badge className={statusColors[report.status] || statusColors.pending}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {report.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-6 text-center">
          <Link href="/scam-lookup">
            <Button variant="outline" size="sm" data-testid="link-scam-lookup">
              <SearchIcon className="w-4 h-4 mr-2" /> Check Scam Database
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground" data-testid="text-disclaimer">
          WorkAbroad Hub is a career consultation service. We do not sell jobs nor guarantee employment.
          Reports are reviewed by our compliance team to protect the community.
        </p>
      </div>
    </div>
  );
}
