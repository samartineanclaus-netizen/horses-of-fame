import {admissionProxy} from '../../../../../lib/owner-voting/proxy.cjs';
export const runtime='nodejs';
export async function POST(request) {return admissionProxy(request,process.env.HOF_ADMISSION_URL);}
