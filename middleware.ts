import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          req.cookies.set({
            name,
            value,
            ...options,
          })
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          })
          res.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          req.cookies.set({
            name,
            value: '',
            ...options,
          })
          res = NextResponse.next({
            request: {
              headers: req.headers,
            },
          })
          res.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { nextUrl } = req
  const isLoggedIn = !!session
  console.log("Session:", session, "Is Logged In:", isLoggedIn)
  // // Public routes accessible to all users
  // const publicRoutes = ["/login", "/register", "/auth/callback", "/debug"]
  // const isPublicRoute = publicRoutes.some((route) => nextUrl.pathname.startsWith(route))

  // // If the user is not logged in and trying to access a protected route
  // if (!isLoggedIn && !isPublicRoute && nextUrl.pathname !== "/") {
  //   console.log("User not logged in, redirecting to login page")
  //   return NextResponse.redirect(new URL("/login", nextUrl))
  // }

  // // If the user is logged in and trying to access login/register
  // if (isLoggedIn && (nextUrl.pathname === "/login" || nextUrl.pathname === "/register")) {
  //   return NextResponse.redirect(new URL("/", nextUrl))
  // }

  return res
}

// Ensure middleware runs on relevant paths
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
