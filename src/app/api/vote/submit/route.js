import {signedProxy} from '../../../../../lib/owner-voting/signed-proxy.cjs';
export const runtime='nodejs';
export async function POST(request){return signedProxy(request,process.env.HOF_SIGNED_SERVICE_URL,'/vote/submit');}
