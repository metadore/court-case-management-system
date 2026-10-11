import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/", "/search", "/login", "/register"];
const publicPrefixes = ["/public/cases/"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value ?? request.headers.get("authorization")?.replace("Bearer ", "");
  const { pathname } = request.nextUrl;

  const isPublic =
    publicPaths.includes(pathname) || publicPrefixes.some((p) => pathname.startsWith(p));

  if (!isPublic && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};