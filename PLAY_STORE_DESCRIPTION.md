# WorkAbroad Hub - Google Play Store Listing

## App Name
WorkAbroad Hub - Overseas Jobs Kenya

## Short Description (80 characters max)
Verified overseas job portals, scam protection & NEA agency verification for Kenyans

## Full Description (4000 characters max)

**WorkAbroad Hub** is a professional career consultation service designed for Kenyan job seekers pursuing overseas employment. Our service combines personalized 1-on-1 guidance with comprehensive career resources to help you navigate the international job market safely.

**What You Get:**

**1-on-1 Career Consultation**
Your consultation fee includes a personal WhatsApp session with a career advisor who will:
- Assess your skills and experience
- Recommend suitable countries and industries
- Guide you through the application process
- Answer your specific questions

**Personalized Recommendations**
Receive tailored advice based on your profile, including country-specific job opportunities and application strategies.

**Curated Job Portal Access**
Access verified job portals for USA, Canada, UK, UAE, Australia, and Europe (Germany, France, Netherlands, Italy, Spain, Poland, Sweden). All links are regularly reviewed for authenticity.

**NEA Agency Verification**
Protect yourself from unlicensed recruitment agencies:
- Search our database of NEA (National Employment Authority) licensed agencies
- Check license validity with color-coded status indicators
- View expiry dates and agency details
- Download the full agency list as Excel or PDF
- Report suspicious agencies to help protect fellow job seekers

**Scam Protection Education**
Learn how to identify job scams with our comprehensive guides:
- "Before You Apply" checklists for each country
- Common scam warning signs
- What legitimate agencies should and shouldn't ask for
- Visa process information

**Career Services (Optional)**
Access professional services to boost your application:
- CV/Resume writing and optimization
- Cover letter preparation
- Interview coaching
- Visa guidance
- LinkedIn profile optimization

**User Education Features**
- Interactive warnings when viewing expired agency licenses
- "Before & After" comparison showing what changes when a license expires
- Clear guidance on protecting yourself from fraud

**What We Are NOT:**
WorkAbroad Hub is a career consultation service, NOT a recruitment agency. We do not sell jobs, guarantee employment, or process visa applications. All job applications are made directly by you on third-party platforms. We provide professional career guidance and curated resources.

**Data Privacy:**
- Secure authentication via Replit Auth
- No personal data sold to third parties
- Minimal data collection policy

**Consultation Fee:**
One-time fee of KES 4,500 for your career consultation package, which includes:
- 1-on-1 WhatsApp consultation session (scheduled within 24-48 hours)
- Personalized country and job recommendations
- Lifetime access to all verified job portals and resources

NEA Agency Verification is free for all users.

---

## Category
Business

## Content Rating
Mature 17+ (Business/Finance category)

## Target Age Group
18+

## Privacy Policy URL
https://workabroadhub.tech/privacy-policy

## Contact Email
support@workabroadhub.tech

---

## Screenshots Required (minimum 2, maximum 8)
1. Landing page showing countries
2. Dashboard with country cards
3. NEA Agency verification search
4. Agency education popup (expired agency warning)
5. Country page with job portals
6. Payment page (M-Pesa option)
7. Admin heat map dashboard
8. Mobile view of agency search

---

## App Store Safety Section Declarations

### Data Collection
- **Personal Info Collected:** Email address (for account creation)
- **Location:** Not collected
- **Financial Info:** Payment transaction records (for purchase verification)
- **Contacts:** Not collected
- **Device Info:** Not collected

### Data Usage
- Account management
- App functionality
- Service improvement

### Data Sharing
- No data shared with third parties
- No data sold

### Security
- Data encrypted in transit (HTTPS)
- Secure authentication (OAuth 2.0)
- User can request data deletion

---

## Compliance Notes

### NEA Disclaimer (Must be visible in-app)
"This platform is not affiliated with, endorsed by, or associated with the National Employment Authority (NEA). Agency license information is provided for public awareness only. Users should verify all information directly with NEA."

### Service Description Disclaimer (Must be visible in-app)
"WorkAbroad Hub is a professional career consultation service. We do not sell jobs, guarantee employment, or process visa applications. All applications are made by you on third-party platforms. We provide personalized career guidance and curated resources."

### Consultation Fee Disclaimer
"Your consultation fee covers: (1) A 1-on-1 WhatsApp session with a career advisor, (2) Personalized country and job recommendations, (3) Lifetime access to verified job portal resources. This consultation service does not guarantee employment or visa approval."

---

## Version History
- v1.0: Initial release with 5 regions, NEA verification, payment system
- v1.1: Added Europe sub-countries, expiry heat map, WhatsApp alerts, education popups

---

## Android WebView Security Configuration

When wrapping this web app in an Android WebView for Play Store deployment, apply these security settings:

```kotlin
// MainActivity.kt - WebView Security Configuration

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        webView = findViewById(R.id.webView)
        
        // Security settings
        webView.settings.apply {
            // SECURITY: Disable file access to prevent local file theft
            allowFileAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            
            // SECURITY: Prevent JavaScript from opening new windows (popup attacks)
            javaScriptCanOpenWindowsAutomatically = false
            
            // SECURITY: Disable content URL access
            allowContentAccess = false
            
            // Enable JavaScript (required for app functionality)
            javaScriptEnabled = true
            
            // Enable DOM storage for session management
            domStorageEnabled = true
            
            // Disable geolocation (not needed)
            setGeolocationEnabled(false)
            
            // Set secure mixed content mode
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        
        // SECURITY: Disable WebView debugging in production
        if (!BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(false)
        }
        
        // SECURITY: Override URL loading to prevent external navigation
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                
                // Only allow your app's domain
                return if (url.startsWith("https://your-app-domain.replit.app")) {
                    false // Load in WebView
                } else {
                    // Open external links in browser
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                    true
                }
            }
        }
        
        // Load your web app
        webView.loadUrl("https://your-app-domain.replit.app")
    }
    
    // Handle back button
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
```

### Required Permissions (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<!-- Do NOT add: READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, ACCESS_FINE_LOCATION -->
```

### ProGuard Rules (proguard-rules.pro)
```proguard
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
```

### Security Checklist
- [ ] `allowFileAccess = false` - Prevents local file access
- [ ] `javaScriptCanOpenWindowsAutomatically = false` - Blocks popup attacks
- [ ] `WebView.setWebContentsDebuggingEnabled(false)` in production
- [ ] `mixedContentMode = MIXED_CONTENT_NEVER_ALLOW` - HTTPS only
- [ ] URL whitelist to prevent navigation to malicious sites
- [ ] No unnecessary permissions in manifest
- [ ] Certificate pinning (optional, advanced)
