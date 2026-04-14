import { authClient } from "@/auth/client"
import { Button, ButtonProps } from "@workspace/ui/components/button"
import { Icon, type IconProps } from "@workspace/ui/components/icon/icon"

type Provider = "google" | "github" | "discord"



const providerMap: Record<Provider, { icon: IconProps['name'], label: string }> = {
    google: {
        icon: "flatColorIcons:google",
        label: "Sign in with Google"
    },
    github: {
        icon: "fe:github",
        label: "Sign in with Github"
    },
    discord: {
        icon: "skillIcons:discord",
        label: "Sign in with Discord"
    }
}

type SocialButtonProps = ButtonProps & {
    provider: Provider
}

export function SocialButton({ provider, variant = 'outline', onClick, ...props }: SocialButtonProps) {
    const { icon, label } = providerMap[provider]

    const handleClick: ButtonProps['onClick'] = async (e) => {
        console.log(123);
        
        const res = await authClient.signIn.social({
            provider,
            callbackURL: "/"
        })
        console.log(res)
    }

    return (
        <Button variant={variant} onClick={handleClick} {...props}>
            <Icon name={icon} />
            <span>{label}</span>
        </Button>
    )
}