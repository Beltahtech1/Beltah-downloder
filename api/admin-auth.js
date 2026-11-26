export default async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Method not allowed"});}
  const expected=process.env.ADMIN_PASSCODE || "Beltah@2027";
  if(!expected)return res.status(503).json({error:"Admin authentication is not configured. Set ADMIN_PASSCODE in Vercel Environment Variables."});
  const {passcode}=req.body||{};
  if(typeof passcode!=="string"||passcode.length>200||passcode!==expected)return res.status(401).json({error:"Incorrect passcode."});
  // This endpoint verifies the passcode for the browser-only settings panel.
  // It does not grant access to protected backend operations.
  return res.status(200).json({ok:true});
}