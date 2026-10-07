export default function ChatsIndexPage() {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center bg-gray-02">
      <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2c6bed" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-gray-60 text-sm">Select a conversation to start messaging</p>
    </div>
  );
}
