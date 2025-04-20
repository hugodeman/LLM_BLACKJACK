import {Link, Outlet} from "react-router";

function Layout(){
    return (
        <>
            <header className="bg-gradient-to-br from-[#1a1a1a] to-[#2c2c2c] text-yellow-400 py-4 shadow-lg">
                <div className="container mx-auto px-6 flex items-center justify-between">
                    <h1 className="text-4xl font-bold text-center tracking-widest shadow-xl">🎰 Casino Chatbot</h1>
                </div>
            </header>

            <nav className="bg-[#2a2a2a] text-yellow-400 py-3 shadow-xl border-b border-yellow-600">
                <div className="container mx-auto px-6 flex space-x-6 justify-center">
                    <Link to="/" className="text-lg font-semibold hover:text-gray-300">
                        Home
                    </Link>
                </div>
            </nav>

            <main className="container mx-auto px-6 py-6 bg-gradient-to-br from-[#3a3a3a] to-[#4a4a4a] min-h-screen">
                <Outlet/>
            </main>
        </>
    )
}

export default Layout;
