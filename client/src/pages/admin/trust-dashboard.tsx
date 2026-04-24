import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AdminLayout from "@/components/admin-layout";
import { 
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  BarChart3,
  Activity,
  Eye,
  RefreshCw
} from "lucide-react";

interface TrustMetrics {
  totalOrders: number;
  autoApproved: number;
  humanReviewed: number;
  flaggedForReview: number;
  averageQualityScore: number;
  hallucinationDetections: number;
  autoApprovalRate: number;
  avgProcessingTime: number;
  recentOrders: Array<{
    id: string;
    serviceName: string;
    status: string;
    qualityScore: number | null;
    needsHumanReview: boolean;
    createdAt: string;
    checkDetails: Record<string, any> | null;
  }>;
  qualityDistribution: {
    excellent: number;
    good: number;
    acceptable: number;
    poor: number;
  };
  failReasons: Array<{
    reason: string;
    count: number;
  }>;
  serviceStats: Array<{
    serviceName: string;
    total: number;
    autoApproved: number;
    avgScore: number;
  }>;
}

function getScoreColor(score: number): string {
  if (score >= 85) return "text-green-600";
  if (score >= 75) return "text-blue-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

function getScoreBadge(score: number | null) {
  if (score === null) return <Badge variant="secondary">N/A</Badge>;
  if (score >= 85) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
  if (score >= 75) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
  if (score >= 60) return <Badge className="bg-yellow-100 text-yellow-800">Acceptable</Badge>;
  return <Badge className="bg-red-100 text-red-800">Poor</Badge>;
}

export default function TrustDashboard() {
  const { data: metrics, isLoading, refetch } = useQuery<TrustMetrics>({
    queryKey: ["/api/admin/trust-metrics"],
  });

  if (isLoading) {
    return (
      <AdminLayout title="Trust Dashboard">
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </AdminLayout>
    );
  }

  const data = metrics || {
    totalOrders: 0,
    autoApproved: 0,
    humanReviewed: 0,
    flaggedForReview: 0,
    averageQualityScore: 0,
    hallucinationDetections: 0,
    autoApprovalRate: 0,
    avgProcessingTime: 0,
    recentOrders: [],
    qualityDistribution: { excellent: 0, good: 0, acceptable: 0, poor: 0 },
    failReasons: [],
    serviceStats: []
  };

  return (
    <AdminLayout title="Trust Dashboard">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">AI Quality Metrics</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Auto-Approval Rate</p>
                  <p className={`text-3xl font-bold ${data.autoApprovalRate >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {data.autoApprovalRate.toFixed(1)}%
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <Progress value={data.autoApprovalRate} className="mt-3" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Quality Score</p>
                  <p className={`text-3xl font-bold ${getScoreColor(data.averageQualityScore)}`}>
                    {data.averageQualityScore.toFixed(0)}
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Target: 75+</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hallucination Flags</p>
                  <p className={`text-3xl font-bold ${data.hallucinationDetections > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {data.hallucinationDetections}
                  </p>
                </div>
                <AlertTriangle className={`h-8 w-8 ${data.hallucinationDetections > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Fabricated content detected</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Review</p>
                  <p className={`text-3xl font-bold ${data.flaggedForReview > 5 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                    {data.flaggedForReview}
                  </p>
                </div>
                <Eye className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Needs human review</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Processing Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Auto-Approved</span>
                  </div>
                  <span className="font-semibold">{data.autoApproved}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    <span>Human Reviewed</span>
                  </div>
                  <span className="font-semibold">{data.humanReviewed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span>Flagged for Review</span>
                  </div>
                  <span className="font-semibold">{data.flaggedForReview}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Avg Processing Time</span>
                  </div>
                  <span className="font-semibold">{data.avgProcessingTime.toFixed(1)}s</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quality Distribution</CardTitle>
              <CardDescription>Score breakdown across all orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-20 text-sm">Excellent</div>
                  <Progress value={(data.qualityDistribution.excellent / Math.max(data.totalOrders, 1)) * 100} className="flex-1 bg-green-100" />
                  <span className="w-8 text-sm text-right">{data.qualityDistribution.excellent}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 text-sm">Good</div>
                  <Progress value={(data.qualityDistribution.good / Math.max(data.totalOrders, 1)) * 100} className="flex-1" />
                  <span className="w-8 text-sm text-right">{data.qualityDistribution.good}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 text-sm">Acceptable</div>
                  <Progress value={(data.qualityDistribution.acceptable / Math.max(data.totalOrders, 1)) * 100} className="flex-1 bg-yellow-100" />
                  <span className="w-8 text-sm text-right">{data.qualityDistribution.acceptable}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 text-sm">Poor</div>
                  <Progress value={(data.qualityDistribution.poor / Math.max(data.totalOrders, 1)) * 100} className="flex-1 bg-red-100" />
                  <span className="w-8 text-sm text-right">{data.qualityDistribution.poor}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.failReasons.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                Top Fail Reasons
              </CardTitle>
              <CardDescription>Most common reasons for flagging orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.failReasons.map((reason, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-sm">{reason.reason}</span>
                    <Badge variant="outline">{reason.count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {data.serviceStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Performance by Service</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Auto-Approved</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Avg Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.serviceStats.map((stat) => (
                    <TableRow key={stat.serviceName}>
                      <TableCell className="font-medium">{stat.serviceName}</TableCell>
                      <TableCell className="text-right">{stat.total}</TableCell>
                      <TableCell className="text-right">{stat.autoApproved}</TableCell>
                      <TableCell className="text-right">
                        {((stat.autoApproved / Math.max(stat.total, 1)) * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={getScoreColor(stat.avgScore)}>{stat.avgScore.toFixed(0)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest processed orders with quality metrics</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.serviceName}</TableCell>
                      <TableCell>
                        <Badge variant={order.status === 'completed' ? 'default' : 'secondary'}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{getScoreBadge(order.qualityScore)}</TableCell>
                      <TableCell>
                        {order.needsHumanReview ? (
                          <Badge variant="outline" className="text-yellow-600">
                            <Eye className="h-3 w-3 mr-1" />
                            Review
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Auto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No orders processed yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
