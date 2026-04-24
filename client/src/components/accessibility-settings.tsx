import { useAccessibility } from "@/contexts/accessibility-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Eye, Type, Zap, RotateCcw } from "lucide-react";

export function AccessibilitySettings() {
  const { settings, setTextSize, setHighContrast, setReduceMotion, resetSettings } = useAccessibility();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" aria-hidden="true" />
          Accessibility Settings
        </CardTitle>
        <CardDescription>
          Customize the display to improve readability and usability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="text-size" className="flex items-center gap-2 text-base font-medium">
                <Type className="h-4 w-4" aria-hidden="true" />
                Text Size
              </Label>
              <p className="text-sm text-muted-foreground">
                Choose a text size that's comfortable to read
              </p>
            </div>
          </div>
          <div 
            className="flex gap-2" 
            role="radiogroup" 
            aria-label="Text size options"
          >
            <Button
              variant={settings.textSize === "normal" ? "default" : "outline"}
              onClick={() => setTextSize("normal")}
              role="radio"
              aria-checked={settings.textSize === "normal"}
              data-testid="button-text-normal"
              className="flex-1 touch-target-min"
            >
              Normal
            </Button>
            <Button
              variant={settings.textSize === "large" ? "default" : "outline"}
              onClick={() => setTextSize("large")}
              role="radio"
              aria-checked={settings.textSize === "large"}
              data-testid="button-text-large"
              className="flex-1 touch-target-min"
            >
              Large
            </Button>
            <Button
              variant={settings.textSize === "larger" ? "default" : "outline"}
              onClick={() => setTextSize("larger")}
              role="radio"
              aria-checked={settings.textSize === "larger"}
              data-testid="button-text-larger"
              className="flex-1 touch-target-min"
            >
              Larger
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-t">
          <div className="space-y-0.5">
            <Label htmlFor="high-contrast" className="flex items-center gap-2 text-base font-medium cursor-pointer">
              <Eye className="h-4 w-4" aria-hidden="true" />
              High Contrast
            </Label>
            <p className="text-sm text-muted-foreground">
              Increase color contrast for better visibility
            </p>
          </div>
          <Switch
            id="high-contrast"
            checked={settings.highContrast}
            onCheckedChange={setHighContrast}
            aria-describedby="high-contrast-desc"
            data-testid="switch-high-contrast"
          />
          <span id="high-contrast-desc" className="sr-only">
            Enable high contrast mode for increased visibility
          </span>
        </div>

        <div className="flex items-center justify-between py-3 border-t">
          <div className="space-y-0.5">
            <Label htmlFor="reduce-motion" className="flex items-center gap-2 text-base font-medium cursor-pointer">
              <Zap className="h-4 w-4" aria-hidden="true" />
              Reduce Motion
            </Label>
            <p className="text-sm text-muted-foreground">
              Minimize animations and movement
            </p>
          </div>
          <Switch
            id="reduce-motion"
            checked={settings.reduceMotion}
            onCheckedChange={setReduceMotion}
            aria-describedby="reduce-motion-desc"
            data-testid="switch-reduce-motion"
          />
          <span id="reduce-motion-desc" className="sr-only">
            Enable reduced motion to minimize animations
          </span>
        </div>

        <div className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={resetSettings}
            className="w-full"
            data-testid="button-reset-accessibility"
            aria-label="Reset all accessibility settings to default"
          >
            <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Reset to Default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
