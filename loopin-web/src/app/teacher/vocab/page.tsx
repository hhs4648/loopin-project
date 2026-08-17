import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { getTeacherSidebarHotspots } from "@/config/figma-hotspots";
import { readAssetFile } from "@/lib/assets";

export default function VocabBuilderPage() {
  return (
    <TeacherFigmaFrame
      svg={readAssetFile("calendar-home.svg")}
      alt="단어장 만들기"
      width={1557}
      height={973}
      hotspots={getTeacherSidebarHotspots()}
      vocab
    />
  );
}
