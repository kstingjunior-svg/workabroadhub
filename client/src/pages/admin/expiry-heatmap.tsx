import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import AdminLayout from "@/components/admin-layout";
import { Calendar, AlertTriangle, CheckCircle2, XCircle, Clock, MessageCircle } from "lucide-react";

interface NeaAgency {
  id: string;
  agencyName: string;
  licenseNumber: string;
  issueDate: string;
  expiryDate: string;
  statusOverride: string | null;
  notes: string | null;
  isPublished: boolean;
  lastUpdated: string;
}

interface MonthData {
  month: string;
  year: number;
  monthNum: number;
  agencies: NeaAgency[];
  expiredCount: number;
  expiringCount: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getHeatColor(expiredCount: number, expiringCount: number, total: number): string {
  if (total === 0) return "bg-muted";
  if (expiredCount > 0) return "bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-800";
  if (expiringCount > 0) return "bg-amber-100 dark:bg-amber-950 border-amber-300 dark:border-amber-800";
  return "bg-green-100 dark:bg-green-950 border-green-300 dark:border-green-800";
}

function generateWhatsAppMessage(agencies: NeaAgency[], type: "expired" | "expiring" | "all"): string {
  const today = new Date();
  let message = `*NEA Agency Expiry Alert*\n_Generated: ${today.toLocaleDateString("en-GB")}_\n\n`;
  
  const filtered = agencies.filter(agency => {
    const expiryDate = new Date(agency.expiryDate);
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (type === "expired") return daysLeft < 0;
    if (type === "expiring") return daysLeft >= 0 && daysLeft <= 30;
    return true;
  });
  
  if (type === "expired") {
    message += `*${filtered.length} EXPIRED LICENSE(S):*\n`;
  } else if (type === "expiring") {
    message += `*${filtered.length} LICENSE(S) EXPIRING SOON:*\n`;
  }
  
  filtered.slice(0, 10).forEach((agency, i) => {
    const expiryDate = new Date(agency.expiryDate);
    message += `${i + 1}. ${agency.agencyName}\n`;
    message += `   License: ${agency.licenseNumber}\n`;
    message += `   Expires: ${expiryDate.toLocaleDateString("en-GB")}\n\n`;
  });
  
  if (filtered.length > 10) {
    message += `_...and ${filtered.length - 10} more_\n`;
  }
  
  message += `\n_Action Required: Review and follow up._`;
  return encodeURIComponent(message);
}

export default function ExpiryHeatmap() {
  const { data: agencies, isLoading } = useQuery<NeaAgency[]>({
    queryKey: ["/api/admin/nea-agencies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/nea-agencies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agencies");
      return res.json();
    },
  });

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // Generate 12 months data (6 past, current, 5 future)
  const monthsData: MonthData[] = [];
  for (let i = -3; i <= 8; i++) {
    const date = new Date(currentYear, currentMonth + i, 1);
    const year = date.getFullYear();
    const monthNum = date.getMonth();
    
    const monthAgencies = agencies?.filter(agency => {
      const expiryDate = new Date(agency.expiryDate);
      return expiryDate.getFullYear() === year && expiryDate.getMonth() === monthNum;
    }) || [];
    
    const expiredCount = monthAgencies.filter(a => {
      const expiryDate = new Date(a.expiryDate);
      return expiryDate < today;
    }).length;
    
    const expiringCount = monthAgencies.filter(a => {
      const expiryDate = new Date(a.expiryDate);
      const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 30;
    }).length;
    
    monthsData.push({
      month: MONTHS[monthNum],
      year,
      monthNum,
      agencies: monthAgencies,
      expiredCount,
      expiringCount,
    });
  }

  // Calculate summary stats
  const totalAgencies = agencies?.length || 0;
  const expiredAgencies = agencies?.filter(a => {
    const expiryDate = new Date(a.expiryDate);
    return expiryDate < today && a.statusOverride !== "suspended";
  }) || [];
  const expiringAgencies = agencies?.filter(a => {
    const expiryDate = new Date(a.expiryDate);
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft >= 0 && daysLeft <= 30;
  }) || [];
  const validAgencies = agencies?.filter(a => {
    const expiryDate = new Date(a.expiryDate);
    return expiryDate >= today && a.statusOverride !== "suspended";
  }) || [];

  const whatsappExpiredLink = `https://wa.me/?text=${generateWhatsAppMessage(expiredAgencies, "expired")}`;
  const whatsappExpiringLink = `https://wa.me/?text=${generateWhatsAppMessage(expiringAgencies, "expiring")}`;

  return (
    <AdminLayout title="Agency Expiry Heat Map">
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalAgencies}</p>
                  <p className="text-xs text-muted-foreground">Total Agencies</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{validAgencies.length}</p>
                  <p className="text-xs text-muted-foreground">Valid Licenses</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{expiringAgencies.length}</p>
                  <p className="text-xs text-muted-foreground">Expiring in 30 days</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{expiredAgencies.length}</p>
                  <p className="text-xs text-muted-foreground">Expired</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">WhatsApp Alert Actions</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Send agency expiry alerts to your team via WhatsApp</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                {expiredAgencies.length > 0 && (
                  <a href={whatsappExpiredLink} target="_blank" rel="noopener noreferrer">
                    <Button variant="destructive" data-testid="button-whatsapp-expired">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Alert: {expiredAgencies.length} Expired
                    </Button>
                  </a>
                )}
                {expiringAgencies.length > 0 && (
                  <a href={whatsappExpiringLink} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="border-amber-300 text-amber-700" data-testid="button-whatsapp-expiring">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Alert: {expiringAgencies.length} Expiring Soon
                    </Button>
                  </a>
                )}
                {expiredAgencies.length === 0 && expiringAgencies.length === 0 && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span>No urgent alerts - all licenses are valid</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Click a button to open WhatsApp with a pre-filled message containing agency details.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Expiry Timeline (12 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4 text-sm">
                <span className="text-muted-foreground">Legend:</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-950 border border-green-300" />
                  <span>Valid</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-amber-100 dark:bg-amber-950 border border-amber-300" />
                  <span>Expiring Soon</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-950 border border-red-300" />
                  <span>Expired</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-muted border" />
                  <span>No Expiries</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {monthsData.map((data, index) => {
                  const isCurrentMonth = data.year === currentYear && data.monthNum === currentMonth;
                  const heatColor = getHeatColor(data.expiredCount, data.expiringCount, data.agencies.length);
                  
                  return (
                    <Card
                      key={index}
                      className={`${heatColor} ${isCurrentMonth ? "ring-2 ring-primary" : ""} transition-all hover:scale-105`}
                      data-testid={`heatmap-cell-${data.month}-${data.year}`}
                    >
                      <CardContent className="p-3 text-center">
                        <p className="font-semibold">{data.month}</p>
                        <p className="text-xs text-muted-foreground">{data.year}</p>
                        <div className="mt-2">
                          <p className="text-2xl font-bold">{data.agencies.length}</p>
                          <p className="text-xs text-muted-foreground">expiries</p>
                        </div>
                        {data.expiredCount > 0 && (
                          <Badge variant="destructive" className="mt-2 text-xs">
                            {data.expiredCount} expired
                          </Badge>
                        )}
                        {data.expiringCount > 0 && data.expiredCount === 0 && (
                          <Badge className="mt-2 text-xs bg-amber-500">
                            {data.expiringCount} soon
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {(expiredAgencies.length > 0 || expiringAgencies.length > 0) && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  Agencies Requiring Attention
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {expiredAgencies.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-red-600 mb-2">Expired Licenses ({expiredAgencies.length})</h4>
                      <div className="grid gap-2">
                        {expiredAgencies.slice(0, 5).map(agency => (
                          <div key={agency.id} className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950/30 rounded text-sm">
                            <div>
                              <span className="font-medium">{agency.agencyName}</span>
                              <span className="text-muted-foreground ml-2">({agency.licenseNumber})</span>
                            </div>
                            <span className="text-red-600 text-xs">
                              Expired {new Date(agency.expiryDate).toLocaleDateString("en-GB")}
                            </span>
                          </div>
                        ))}
                        {expiredAgencies.length > 5 && (
                          <p className="text-xs text-muted-foreground">...and {expiredAgencies.length - 5} more</p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {expiringAgencies.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-amber-600 mb-2">Expiring Soon ({expiringAgencies.length})</h4>
                      <div className="grid gap-2">
                        {expiringAgencies.slice(0, 5).map(agency => {
                          const daysLeft = Math.ceil((new Date(agency.expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <div key={agency.id} className="flex items-center justify-between p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-sm">
                              <div>
                                <span className="font-medium">{agency.agencyName}</span>
                                <span className="text-muted-foreground ml-2">({agency.licenseNumber})</span>
                              </div>
                              <span className="text-amber-600 text-xs font-medium">
                                {daysLeft} days left
                              </span>
                            </div>
                          );
                        })}
                        {expiringAgencies.length > 5 && (
                          <p className="text-xs text-muted-foreground">...and {expiringAgencies.length - 5} more</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
