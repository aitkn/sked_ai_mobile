# OAuth Mobile App Solution

The issue: OAuth redirects to your website (skedai.com) instead of back to the mobile app.

## Solution 1: Add this to your skedai.com website

Create a new page/route at `https://www.skedai.com/auth/mobile-callback`:

```javascript
// pages/auth/mobile-callback.js (Next.js example)
import { useEffect } from 'react';

export default function MobileAuthCallback() {
  useEffect(() => {
    // Get the hash parameters (Supabase returns tokens in hash)
    const hash = window.location.hash;
    
    if (hash) {
      // Redirect to mobile app with the hash
      const mobileDeepLink = `skedaiapp://auth-callback${hash}`;
      
      // Try to open the app
      window.location.href = mobileDeepLink;
      
      // Show a fallback UI
      setTimeout(() => {
        document.getElementById('manual-button').style.display = 'block';
      }, 1000);
    }
  }, []);

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h2>Signing you in...</h2>
      <p>Redirecting to the SkedAI app...</p>
      
      <button 
        id="manual-button"
        style={{ display: 'none', marginTop: '20px' }}
        onClick={() => {
          window.location.href = `skedaiapp://auth-callback${window.location.hash}`;
        }}
      >
        Open App Manually
      </button>
      
      <p style={{ marginTop: '40px', fontSize: '14px', color: '#666' }}>
        If the app doesn't open, make sure SkedAI is installed.
      </p>
    </div>
  );
}
```

## Solution 2: Use Apple/Android App Links

### For iOS (Universal Links):
1. Host an `apple-app-site-association` file at:
   `https://www.skedai.com/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.skedai.app",
        "paths": ["/auth/mobile-callback/*"]
      }
    ]
  }
}
```

### For Android (App Links):
1. Host an `assetlinks.json` file at:
   `https://www.skedai.com/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.skedai.app",
    "sha256_cert_fingerprints": ["YOUR_APP_CERT_FINGERPRINT"]
  }
}]
```

## Solution 3: Simple Redirect Page

If you can't modify the main site, create a simple redirect page:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Completing sign in...</title>
    <script>
        // Immediately try to redirect to the app
        const hash = window.location.hash;
        if (hash) {
            window.location.href = 'skedaiapp://auth-callback' + hash;
        }
    </script>
</head>
<body>
    <p>Redirecting to app...</p>
</body>
</html>
```

## Testing the Solution

1. Add the redirect page to your website
2. Update Supabase redirect URLs to include:
   - `https://www.skedai.com/auth/mobile-callback`
3. The flow will be:
   - App → Google/Apple → Supabase → Your redirect page → Back to app