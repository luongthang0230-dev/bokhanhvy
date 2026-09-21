import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, Eraser, Check, ArrowLeftRight } from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  UNITS,
  KIND_LABELS,
  convertFree,
  bubbleDimension,
  formatResult,
  unitLabel,
  type UnitId,
  type UnitKind,
} from "@/lib/unit-converter";

export const Route = createFileRoute("/congcu")({
  head: () => ({ meta: [{ title: "Công cụ — Chuyển đổi đơn vị & Bubble Dimension" }] }),
  component: CongCuPage,
});

function CongCuPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">Công cụ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chuyển đổi đơn vị và tính Bubble Dimension nhanh, dùng cho công việc OQC hằng ngày.
          </p>
        </div>

        <Tabs defaultValue="donvi">
          <TabsList>
            <TabsTrigger value="donvi">Chuyển đổi đơn vị</TabsTrigger>
            <TabsTrigger value="bubble">Tính bóng khí</TabsTrigger>
          </TabsList>
          <TabsContent value="donvi" className="mt-4">
            <UnitConverterCard />
          </TabsContent>
          <TabsContent value="bubble" className="mt-4">
            <BubbleDimensionCard />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}

// ============================================================================
// Chuyển đổi đơn vị — tự do chọn đơn vị đầu vào / đầu ra, không chia nhóm
// ============================================================================

// Gom đơn vị theo kind chỉ để hiển thị tách nhóm trực quan trong danh sách
// thả xuống (label), KHÔNG giới hạn việc chọn — người dùng vẫn chọn tự do
// bất kỳ đơn vị nào ở cả 2 ô, kể cả khác kind (vd µm² -> mm).
const UNITS_BY_KIND: Record<UnitKind, typeof UNITS> = {
  length: UNITS.filter((u) => u.kind === "length"),
  area: UNITS.filter((u) => u.kind === "area"),
  force: UNITS.filter((u) => u.kind === "force"),
};

function UnitSelect({
  value,
  onChange,
  label,
}: {
  value: UnitId;
  onChange: (v: UnitId) => void;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as UnitId)}>
        <SelectTrigger className="h-11 text-base">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(UNITS_BY_KIND) as UnitKind[]).map((kind) => (
            <div key={kind}>
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {KIND_LABELS[kind]}
              </p>
              {UNITS_BY_KIND[kind].map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function UnitConverterCard() {
  const [fromUnit, setFromUnit] = useState<UnitId>("mm");
  const [toUnit, setToUnit] = useState<UnitId>("um");
  const [rawValue, setRawValue] = useState("1");
  const [copied, setCopied] = useState(false);

  const numericValue = rawValue.trim() === "" ? NaN : Number(rawValue.replace(",", "."));

  const result = useMemo(() => {
    if (!isFinite(numericValue)) return null;
    return convertFree(numericValue, fromUnit, toUnit);
  }, [fromUnit, toUnit, numericValue]);

  const fromDef = UNITS.find((u) => u.id === fromUnit);
  const toDef = UNITS.find((u) => u.id === toUnit);
  const crossKind = fromDef && toDef && fromDef.kind !== toDef.kind;
  const unsupported = isFinite(numericValue) && result === null;

  const resultText = result === null ? "" : `${formatResult(result)} ${unitLabel(toUnit)}`;

  function handleSwap() {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }

  function handleClear() {
    setRawValue("");
  }

  async function handleCopy() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      toast.success("Đã copy kết quả");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không copy được, bạn tự chọn và copy giúp mình");
    }
  }

  return (
    <div className="card-surface space-y-4 p-5">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Giá trị</Label>
        <Input
          className="h-11 text-base"
          inputMode="decimal"
          value={rawValue}
          onChange={(e) => setRawValue(e.target.value)}
          placeholder="0"
        />
      </div>

      {/* Xếp dọc trên điện thoại, có nút hoán đổi ở giữa; từ sm trở lên xếp ngang */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex-1">
          <UnitSelect value={fromUnit} onChange={setFromUnit} label="Đơn vị đầu vào" />
        </div>
        <div className="flex justify-center sm:pb-[2px]">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleSwap}
            className="h-9 w-9 shrink-0 rotate-90 sm:rotate-0"
            aria-label="Hoán đổi đơn vị"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1">
          <UnitSelect value={toUnit} onChange={setToUnit} label="Đơn vị kết quả" />
        </div>
      </div>

      {crossKind && !unsupported && (
        <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Diện tích → chiều dài được hiểu là cạnh tương đương (cạnh = √diện tích); chiều dài →
          diện tích được hiểu là diện tích hình vuông có cạnh bằng giá trị nhập — không phải quy
          đổi đơn vị vật lý thông thường.
        </p>
      )}

      {unsupported ? (
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Không thể chuyển đổi giữa lực và chiều dài/diện tích — hãy chọn 2 đơn vị cùng loại (hoặc
          cặp diện tích ↔ chiều dài).
        </div>
      ) : (
        <div className="rounded-xl bg-primary/10 px-4 py-3">
          <p className="text-xs text-muted-foreground">Kết quả</p>
          <p className="font-mono text-2xl font-bold text-primary break-all">
            {resultText || "—"}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleClear}>
          <Eraser className="mr-1.5 h-4 w-4" /> Xoá
        </Button>
        <Button onClick={handleCopy} disabled={!resultText}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          Sao chép kết quả
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Tính bóng khí (Bubble Dimension)
// ============================================================================

function BubbleDimensionCard() {
  const [aRaw, setARaw] = useState("");
  const [bRaw, setBRaw] = useState("");
  const [copied, setCopied] = useState(false);

  const a = aRaw.trim() === "" ? NaN : Number(aRaw.replace(",", "."));
  const b = bRaw.trim() === "" ? NaN : Number(bRaw.replace(",", "."));
  const bothValid = isFinite(a) && isFinite(b);
  const result = bothValid ? bubbleDimension(a, b) : null;

  let message = "";
  if (aRaw.trim() === "" && bRaw.trim() === "") {
    message = "Nhập A và B để tính Bubble Dimension.";
  } else if (!isFinite(a) || !isFinite(b)) {
    message = "A và B phải là số hợp lệ.";
  }

  function handleClear() {
    setARaw("");
    setBRaw("");
  }

  async function handleCopy() {
    if (result === null) return;
    const text = `${formatResult(result)} mm`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Đã copy kết quả");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Không copy được, bạn tự chọn và copy giúp mình");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    // Đã tự tính real-time; Enter chỉ để rời bàn phím ảo trên điện thoại.
    (e.target as HTMLInputElement).blur();
  }

  return (
    <div className="card-surface space-y-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">A (mm)</Label>
          <Input
            inputMode="decimal"
            value={aRaw}
            onChange={(e) => setARaw(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">B (mm)</Label>
          <Input
            inputMode="decimal"
            value={bRaw}
            onChange={(e) => setBRaw(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Công thức: C = (A + B) / 2</p>

      {message ? (
        <div className="rounded-xl bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">{message}</div>
      ) : (
        <div className="rounded-xl bg-primary/10 px-4 py-3">
          <p className="text-xs text-muted-foreground">Bubble Dimension</p>
          <p className="font-mono text-2xl font-bold text-primary">
            C = {result !== null ? formatResult(result) : "—"} mm
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleClear}>
          <Eraser className="mr-1.5 h-4 w-4" /> Xoá
        </Button>
        <Button onClick={handleCopy} disabled={result === null}>
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          Sao chép kết quả
        </Button>
      </div>
    </div>
  );
}
