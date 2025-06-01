// Add this code to your skedai.com website
// It detects mobile OAuth callbacks and redirects to the app

// Option 1: Add to your main app component or router
useEffect(() => {
  // Check if this is a mobile OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  
  // Check for mobile parameter or specific redirect paths
  const isMobileOAuth = urlParams.get('mobile') === 'true' || 
                        urlParams.get('redirect_to')?.includes('skedaiapp://') ||
                        window.location.pathname === '/auth/mobile-callback';
  
  const accessToken = hashParams.get('access_token') || urlParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || urlParams.get('refresh_token');
  
  if (isMobileOAuth && accessToken) {
    // Redirect to mobile app with tokens
    const mobileUrl = `skedaiapp://auth-callback#access_token=${accessToken}&refresh_token=${refreshToken || ''}`;
    window.location.href = mobileUrl;
  }
}, []);

// Option 2: Create a dedicated page at skedai.com/auth/mobile-callback
export default function MobileAuthCallback() {
  const [redirecting, setRedirecting] = useState(false);
  
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    
    if (accessToken) {
      setRedirecting(true);
      // Redirect to mobile app
      window.location.href = `skedaiapp://auth-callback${window.location.hash}`;
      
      // Fallback for if the redirect doesn't work
      setTimeout(() => {
        setRedirecting(false);
      }, 3000);
    }
  }, []);
  
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      fontFamily: 'system-ui'
    }}>
      {redirecting ? (
        <>
          <h2>Authentication Successful!</h2>
          <p>Redirecting back to the app...</p>
          <button 
            onClick={() => window.location.href = `skedaiapp://auth-callback${window.location.hash}`}
            style={{
              marginTop: 20,
              padding: '10px 20px',
              backgroundColor: '#007AFF',
              color: 'white',
              border: 'none',
              borderRadius: 5,
              fontSize: 16,
              cursor: 'pointer'
            }}
          >
            Open App Manually
          </button>
        </>
      ) : (
        <>
          <h2>Authentication Complete</h2>
          <p>You can close this window and return to the app.</p>
        </>
      )}
    </div>
  );
}