import { Link } from "@tanstack/react-router"
import { m } from "@/paraglide/messages"


export function Header() {
    return (
        <header className='sticky top-0 bg-background/50 backdrop-blur h-12 px-4 flex items-center justify-between'>
            <div>1</div>
            <div>
                <Link to="/dashboard">{m.create()}</Link>
            </div>
        </header>
    )
}