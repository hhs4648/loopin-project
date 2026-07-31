import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { getTeacherSidebarHotspots } from "@/config/figma-hotspots";
import { readAssetFile } from "@/lib/assets";
import {
  classTabAsset,
  normalizeClassSvgCanvas,
  parseClassTab,
} from "@/lib/class-tabs";

interface ClassHomePageProps {
  params: Promise<{
    classId: string;
  }>;
  searchParams: Promise<{
    tab?: string | string[];
  }>;
}

export default async function ClassHomePage({
  params,
  searchParams,
}: ClassHomePageProps) {
  const { classId: rawClassId } = await params;
  let classId = rawClassId;
  try {
    classId = decodeURIComponent(rawClassId);
  } catch {
    classId = rawClassId;
  }
  const query = await searchParams;
  const tab = parseClassTab(query.tab);
  const asset = classTabAsset(tab);
  const svg = normalizeClassSvgCanvas(readAssetFile(asset));

  return (
    <TeacherFigmaFrame
      svg={svg}
      alt={`반 ${tab} ${classId}`}
      width={1557}
      height={973}
      hotspots={getTeacherSidebarHotspots()}
      activeClassId={classId}
      classTab={tab}
    />
  );
}
