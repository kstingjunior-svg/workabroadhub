import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MapPin,
  Shield,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Navigation,
  Filter,
  X,
  ExternalLink,
  QrCode,
  Building2,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Link } from "wouter";

interface MapAgency {
  id: string;
  agencyName: string;
  licenseNumber: string;
  latitude: number;
  longitude: number;
  country: string;
  city: string;
  serviceType: string;
  licenseStatus: string;
  expiryDate: string;
  markerColor: string;
  legitimacyScore: {
    overallScore: number;
    tier: string;
  } | null;
}

interface MapFilters {
  countries: string[];
  industries: string[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case "valid":
      return <Badge variant="default" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Valid</Badge>;
    case "expiring_soon":
      return <Badge className="text-xs bg-yellow-500 hover:bg-yellow-600"><Clock className="h-3 w-3 mr-1" />Expiring Soon</Badge>;
    case "expired":
      return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Expired</Badge>;
    case "suspended":
      return <Badge variant="destructive" className="text-xs"><ShieldX className="h-3 w-3 mr-1" />Suspended</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">Unknown</Badge>;
  }
}

function getTierBadge(tier: string, score: number) {
  const configs: Record<string, string> = {
    platinum: "bg-gradient-to-r from-slate-600 to-slate-400 text-white",
    gold: "bg-gradient-to-r from-yellow-600 to-yellow-400 text-white",
    silver: "bg-gradient-to-r from-gray-400 to-gray-300 text-gray-900",
    caution: "bg-gradient-to-r from-orange-500 to-orange-400 text-white",
    high_risk: "bg-gradient-to-r from-red-600 to-red-500 text-white",
  };
  return (
    <Badge className={`text-xs ${configs[tier] || "bg-gray-200"}`}>
      <Shield className="h-3 w-3 mr-1" />
      {score}/100
    </Badge>
  );
}

function AgencyPopup({ agency, onClose }: { agency: MapAgency; onClose: () => void }) {
  return (
    <Card className="w-80 shadow-lg border-2" data-testid={`popup-agency-${agency.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight" data-testid="popup-agency-name">{agency.agencyName}</h3>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {getStatusBadge(agency.licenseStatus)}
          {agency.legitimacyScore && getTierBadge(agency.legitimacyScore.tier, agency.legitimacyScore.overallScore)}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span>{agency.city}, {agency.country}</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span>License: {agency.licenseNumber}</span>
          </div>
          {agency.expiryDate && (
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span>Expires: {new Date(agency.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
          )}
          {agency.serviceType && (
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span>{agency.serviceType}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Link href={`/verify?agency=${agency.id}`}>
            <Button size="sm" variant="default" className="text-xs h-7" data-testid={`popup-verify-${agency.id}`}>
              <ExternalLink className="h-3 w-3 mr-1" />
              Full Profile
            </Button>
          </Link>
          <Link href={`/verify?agency=${agency.id}`}>
            <Button size="sm" variant="outline" className="text-xs h-7" data-testid={`popup-qr-${agency.id}`}>
              <QrCode className="h-3 w-3 mr-1" />
              Verify
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function createMarkerIcon(color: string) {
  const colors: Record<string, string> = {
    green: "#22c55e",
    yellow: "#eab308",
    red: "#ef4444",
    gray: "#9ca3af",
  };
  const fill = colors[color] || colors.gray;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${fill}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="#fff"/>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function createClusterIcon(count: number) {
  let bg = "#3b82f6";
  let size = 36;
  if (count >= 100) { bg = "#ef4444"; size = 48; }
  else if (count >= 50) { bg = "#f97316"; size = 44; }
  else if (count >= 10) { bg = "#eab308"; size = 40; }

  const safeCount = Math.floor(Number(count)); // ensure integer, prevents SVG injection
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${bg}" stroke="#fff" stroke-width="2" opacity="0.9"/>
    <text x="${size/2}" y="${size/2 + 5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="bold" font-family="sans-serif">${safeCount}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default function AgencyMapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const [selectedAgency, setSelectedAgency] = useState<MapAgency | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set("search", debouncedSearch);
  if (countryFilter) queryParams.set("country", countryFilter);
  if (statusFilter) queryParams.set("status", statusFilter);
  if (industryFilter) queryParams.set("industry", industryFilter);
  if (scoreRange[0] > 0) queryParams.set("minScore", String(scoreRange[0]));
  if (scoreRange[1] < 100) queryParams.set("maxScore", String(scoreRange[1]));

  const { data: agencies, isLoading } = useQuery<MapAgency[]>({
    queryKey: ["/api/map/agencies", queryParams.toString()],
    queryFn: async () => {
      const qs = queryParams.toString();
      const res = await fetch(`/api/map/agencies${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch agencies");
      return res.json();
    },
  });

  const { data: filters } = useQuery<MapFilters>({
    queryKey: ["/api/map/filters"],
    queryFn: async () => {
      const res = await fetch("/api/map/filters");
      if (!res.ok) throw new Error("Failed to fetch filters");
      return res.json();
    },
  });

  const initMap = useCallback(async () => {
    if (!mapContainerRef.current || mapRef.current) return;

    const L = (await import("leaflet")).default;
    await import("leaflet/dist/leaflet.css");
    leafletRef.current = L;

    const map = L.map(mapContainerRef.current, {
      center: [-1.2921, 36.8219],
      zoom: 7,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  useEffect(() => {
    initMap();
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [initMap]);

  useEffect(() => {
    if (!mapRef.current || !agencies || !leafletRef.current) return;

    const L = leafletRef.current;

    if (markersRef.current) {
      mapRef.current.removeLayer(markersRef.current);
    }

    const markerGroup = L.layerGroup();
    const bounds: any[] = [];

    const clusterMap = new Map<string, MapAgency[]>();
    const precision = 2;

    for (const agency of agencies) {
      const key = `${agency.latitude.toFixed(precision)},${agency.longitude.toFixed(precision)}`;
      if (!clusterMap.has(key)) clusterMap.set(key, []);
      clusterMap.get(key)!.push(agency);
    }

    for (const [, cluster] of clusterMap) {
      const lat = cluster[0].latitude;
      const lng = cluster[0].longitude;
      bounds.push([lat, lng]);

      if (cluster.length === 1) {
        const agency = cluster[0];
        const icon = L.icon({
          iconUrl: createMarkerIcon(agency.markerColor),
          iconSize: [24, 36],
          iconAnchor: [12, 36],
          popupAnchor: [0, -36],
        });

        const marker = L.marker([lat, lng], { icon });
        marker.on("click", () => setSelectedAgency(agency));
        marker.addTo(markerGroup);
      } else {
        const icon = L.icon({
          iconUrl: createClusterIcon(cluster.length),
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });

        const marker = L.marker([lat, lng], { icon });
        marker.on("click", () => {
          mapRef.current.setView([lat, lng], mapRef.current.getZoom() + 2);
        });
        marker.addTo(markerGroup);
      }
    }

    markerGroup.addTo(mapRef.current);
    markersRef.current = markerGroup;

    if (bounds.length > 0 && !debouncedSearch && !countryFilter) {
      try {
        mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
      } catch (e) {}
    }
  }, [agencies, debouncedSearch, countryFilter]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation || !leafletRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        if (mapRef.current && leafletRef.current) {
          const L = leafletRef.current;
          L.circleMarker(coords, {
            radius: 10,
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.3,
            weight: 2,
          }).addTo(mapRef.current);
          mapRef.current.setView(coords, 12);
        }
      },
      () => {},
      { enableHighAccuracy: true }
    );
  }, []);

  const resetFilters = () => {
    setCountryFilter("");
    setStatusFilter("");
    setIndustryFilter("");
    setScoreRange([0, 100]);
    setSearchQuery("");
  };

  const hasActiveFilters = countryFilter || statusFilter || industryFilter || scoreRange[0] > 0 || scoreRange[1] < 100;

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="agency-map-page">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="flex items-center gap-3 p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold hidden sm:block" data-testid="text-map-title">Agency Registry Map</h1>
          </div>

          <div className="flex-1 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-map-search"
            />
          </div>

          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1"
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <Badge variant="destructive" className="h-4 w-4 p-0 text-[10px] flex items-center justify-center rounded-full">!</Badge>
            )}
            {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>

          <Button variant="outline" size="sm" onClick={handleLocateMe} className="gap-1" data-testid="button-locate-me">
            <Navigation className="h-4 w-4" />
            <span className="hidden sm:inline">Near Me</span>
          </Button>

          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            {isLoading ? (
              <Skeleton className="h-4 w-16" />
            ) : (
              <span data-testid="text-agency-count">{agencies?.length || 0} agencies</span>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="border-t p-3 space-y-3" data-testid="filter-panel">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Country</Label>
                <Select value={countryFilter || "_all"} onValueChange={(v) => setCountryFilter(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-country">
                    <SelectValue placeholder="All Countries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Countries</SelectItem>
                    {filters?.countries.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs mb-1 block">License Status</Label>
                <Select value={statusFilter || "_all"} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-status">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Statuses</SelectItem>
                    <SelectItem value="valid">Valid</SelectItem>
                    <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Industry</Label>
                <Select value={industryFilter || "_all"} onValueChange={(v) => setIndustryFilter(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-industry">
                    <SelectValue placeholder="All Industries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All Industries</SelectItem>
                    {filters?.industries.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Score: {scoreRange[0]}–{scoreRange[1]}</Label>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={scoreRange}
                  onValueChange={(v) => setScoreRange(v as [number, number])}
                  className="mt-2"
                  data-testid="slider-score"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs h-7" data-testid="button-clear-filters">
                  <X className="h-3 w-3 mr-1" />
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0 z-0" data-testid="map-container" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <div className="flex items-center gap-2 bg-background p-4 rounded-lg shadow-lg">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm">Loading agencies...</span>
            </div>
          </div>
        )}

        {selectedAgency && (
          <div className="absolute top-4 right-4 z-20" data-testid="agency-popup">
            <AgencyPopup agency={selectedAgency} onClose={() => setSelectedAgency(null)} />
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-10 bg-background/90 backdrop-blur rounded-lg p-3 text-xs space-y-1.5 shadow-md" data-testid="map-legend">
          <p className="font-semibold text-sm mb-2">Legend</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Verified & Compliant</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>Expiring / Under Review</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Expired / Suspended</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <span>Unverified</span>
          </div>
        </div>
      </div>
    </div>
  );
}
