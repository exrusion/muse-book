import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const isJollyDomain = hostname === "jollybot.lol" || hostname === "www.jollybot.lol";

  if (isJollyDomain) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/jolly";
    return NextResponse.rewrite(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/"
};
