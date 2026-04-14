import { SocialButton } from "@/components/auth/social-button"


export function AuthPage() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <main className="w-full max-w-5xl flex justify-center items-center">
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <SocialButton  provider="google" />
          {/* <SocialButton  provider="github" />
          <SocialButton  provider="discord" /> */}
        </div>
      </main>
    </div>
  )
}