import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, Eraser, Check } from "lucide-react";
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
  LENGTH_UNIT_LABELS,
  AREA_UNIT_LABELS,
  FORCE_UNIT_LABELS,
  convertLength,
  convertArea,
  convertForce,
  areaToEquivalentSide,
  bubbleDimension,
  formatResult,
  type LengthUnit,
  type AreaUnit,
  type ForceUnit,
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
// Chuyển đổi đơn vị
// ============================================================================

type Group = "length" | "area" | "area-to-side" | "force";

const GROUP_LABELS: Record<Group, string> = {
  length: "Chiều dài",
  area: "Diện tích",
  "area-to-side": "Diện tích → cạnh tương đương",
  force: "Lực",
};

const LENGTH_UNITS = Object.keys(LENGTH_UNIT_LABELS) as LengthUnit[];
const AREA_UNITS = Object.keys(AREA_UNIT_LABELS) as AreaUnit[];
const FORCE_UNITS = Object.keys(FORCE_UNIT_LABELS) as ForceUnit[];

function unitsForGroup(group: Group, side: "from" | "to"): { value: string; label: string }[] {
  if (group === "length") return LENGTH_UNITS.map((u) => ({ value: u, label: LENGTH_UNIT_LABELS[u] }));
  if (group === "area") return AREA_UNITS.map((u) => ({ value: u, label: AREA_UNIT_LABELS[u] }));
  if (group === "force") return FORCE_UNITS.map((u) => ({ value: u, label: FORCE_UNIT_LABELS[u] }));
  // area-to-side: đầu vào là đơn vị diện tích, đầu ra là đơn vị chiều dài
  return side === "from"
    ? AREA_UNITS.map((u) => ({ value: u, label: AREA_UNIT_LABELS[u] }))
    : LENGTH_UNITS.map((u) => ({ value: u, label: LENGTH_UNIT_LABELS[u] }));
}

function defaultUnits(group: Group): { from: string; to: string } {
  if (group === "length") return { from: "mm", to: "um" };
  if (group === "area") return { from: "mm2", to: "um2" };
  if (group === "force") return { from: "N", to: "gf" };
  return { from: "mm2", to: "mm" };
}

function UnitConverterCard() {
  const [group, setGroup] = useState<Group>("length");
  const [fromUnit, setFromUnit] = useState<string>("mm");
  const [toUnit, setToUnit] = useState<string>("um");
  const [rawValue, setRawValue] = useState("1");
  const [copied, setCopied] = useState(false);

  function handleGroupChange(next: string) {
    const g = next as Group;
    setGroup(g);
    const d = defaultUnits(g);
    setFromUnit(d.from);
    setToUnit(d.to);
  }

  const numericValue = rawValue.trim() === "" ? NaN : Number(rawValue.replace(",", "."));

  const result = useMemo(() => {
    if (!isFinite(numericValue)) return null;
    if (group === "length") return convertLength(numericValue, fromUnit as LengthUnit, toUnit as LengthUnit);
    if (group === "area") return convertArea(numericValue, fromUnit as AreaUnit, toUnit as AreaUnit);
    if (group === "force") return convertForce(numericValue, fromUnit as ForceUnit, toUnit as ForceUnit);
    return areaToEquivalentSide(numericValue, fromUnit as AreaUnit, toUnit as LengthUnit);
  }, [group, fromUnit, toUnit, numericValue]);

  const toLabel =
    group === "length"
      ? LENGTH_UNIT_LABELS[toUnit as LengthUnit]
      : group === "area"
        ? AREA_UNIT_LABELS[toUnit as AreaUnit]
        : group === "force"
          ? FORCE_UNIT_LABELS[toUnit as ForceUnit]
          : LENGTH_UNIT_LABELS[toUnit as LengthUnit];

  const resultText = result === null ? "" : `${formatResult(result)} ${toLabel}`;

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
        <Label className="text-xs text-muted-foreground">Nhóm chuyển đổi</Label>
        <Select value={group} onValueChange={handleGroupChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(GROUP_LABELS) as Group[]).map((g) => (
              <SelectItem key={g} value={g}>
                {GROUP_LABELS[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Giá trị</Label>
          <Input
            className="w-full sm:w-28"
            inputMode="decimal"
            value={rawValue}
            onChange={(e) => setRawValue(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Đơn vị đầu vào</Label>
          <Select value={fromUnit} onValueChange={setFromUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {unitsForGroup(group, "from").map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Đơn vị kết quả</Label>
          <Select value={toUnit} onValueChange={setToUnit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {unitsForGroup(group, "to").map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {group === "area-to-side" && (
        <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Đây là kích thước cạnh tương đương của hình vuông (cạnh = √diện tích) — không phải phép
          chuyển đổi đơn vị vật lý thông thường.
        </p>
      )}

      <div className="rounded-xl bg-primary/10 px-4 py-3">
        <p className="text-xs text-muted-foreground">Kết quả</p>
        <p className="font-mono text-2xl font-bold text-primary">
          {resultText || "—"}
        </p>
      </div>

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
