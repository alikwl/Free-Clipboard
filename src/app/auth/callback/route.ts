import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.session) {
      const token = data.session.access_token;
      const refreshToken = data.session.refresh_token;
      const expiresIn = data.session.expires_in;
      const redirectUrl = `${origin}${next}`;
      const authPayload = JSON.stringify({
        token,
        refreshToken,
        expiresIn,
      }).replace(/</g, '\\u003c');

      // Render a page that posts the token to the Chrome extension, then redirects
      return new NextResponse(
        `<!DOCTYPE html>
<html><head><title>FreeClipboard</title>
<style>body{background:#07070a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
.spinner{width:40px;height:40px;border:3px solid rgba(255,255,255,0.08);border-top-color:#818cf8;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.container{text-align:center;color:#a0a0b0;font-size:14px}
h3{color:#e2e2e8;margin-top:20px;margin-bottom:8px}
</style></head>
<body><div class="container">
<div class="spinner"></div>
<h3>Signed in</h3>
<p>Redirecting&hellip;</p>
</div>
<script>
var fcAuthPayload=${authPayload};
try{localStorage.setItem('fc_extension_auth',JSON.stringify(fcAuthPayload));}catch(e){}
try{window.opener&&window.opener.postMessage({type:'FC_AUTH',token:fcAuthPayload.token,refreshToken:fcAuthPayload.refreshToken,expiresIn:fcAuthPayload.expiresIn},'*');}catch(e){}
window.postMessage({type:'FC_AUTH',token:fcAuthPayload.token,refreshToken:fcAuthPayload.refreshToken,expiresIn:fcAuthPayload.expiresIn},'*');
setTimeout(function(){window.location.href='${redirectUrl}';},80);
</script></body></html>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=Could not exchange authentication code`
  );
}
