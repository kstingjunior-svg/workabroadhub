import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, Briefcase, MapPin, CheckCircle, Eye, EyeOff, Shield, ExternalLink } from "lucide-react";
import { Link } from "wouter";

const previewJobs = [
  {
    id: 1,
    title: "Healthcare Assistant",
    country: "Canada",
    countryCode: "CA",
    region: "Ontario",
    type: "Full-time",
    category: "Healthcare",
    portalName: "Job Bank Canada",
    verified: true,
    verifiedDate: "Feb 2026",
  },
  {
    id: 2,
    title: "Construction Worker",
    country: "UAE",
    countryCode: "AE",
    region: "Dubai",
    type: "Contract",
    category: "Construction",
    portalName: "GulfTalent",
    verified: true,
    verifiedDate: "Jan 2026",
  },
  {
    id: 3,
    title: "Registered Nurse",
    country: "United Kingdom",
    countryCode: "GB",
    region: "London",
    type: "Full-time",
    category: "Healthcare",
    portalName: "NHS Jobs",
    verified: true,
    verifiedDate: "Feb 2026",
  },
];

export function FreePreviewJobs() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
          <Eye className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white" data-testid="text-free-preview-title">
            Free Preview
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Sample verified job listings</p>
        </div>
      </div>

      <div className="space-y-3">
        {previewJobs.map((job) => (
          <Card key={job.id} className="overflow-hidden border" data-testid={`card-preview-job-${job.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className="text-[10px] font-bold">{job.countryCode}</Badge>
                    <h4 className="font-semibold text-sm" data-testid={`text-preview-job-title-${job.id}`}>{job.title}</h4>
                    {job.verified && (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px]">
                        <CheckCircle className="h-3 w-3 mr-0.5" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {job.region}, {job.country}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {job.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{job.category}</Badge>
                    <span className="text-[10px] text-muted-foreground">via {job.portalName}</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground">Locked</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <EyeOff className="h-3 w-3" />
                  <span>Employer contact & application link hidden</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20" data-testid="card-preview-banner">
        <CardContent className="p-4 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              Preview Only
            </p>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed max-w-sm mx-auto">
            Unlock full verified resources, employer contacts, application links, agency verification tools, and CV assistance with Premium Access.
          </p>
          <Link href="/payment">
            <Button className="w-full" data-testid="button-unlock-premium">
              <Lock className="h-4 w-4 mr-2" />
              Unlock Premium Access
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
