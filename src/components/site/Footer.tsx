import { useSettings } from "@/lib/settings";

export function Footer() {
  const { settings } = useSettings();
  // Chấp nhận cả xuống dòng thật lẫn chuỗi "\n" gõ tay (2 ký tự) —
  // để không phụ thuộc vào cách admin nhập nội dung trên Supabase.
  const lines = settings.footerText.replace(/\\n/g, "\n").split("\n");
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto max-w-4xl px-4 text-center text-sm text-muted-foreground">
        {lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < lines.length - 1 && <br />}
          </span>
        ))}
      </div>
    </footer>
  );
}
