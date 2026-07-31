import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { getTeacherSidebarHotspots } from "@/config/figma-hotspots";
import { readAssetFile } from "@/lib/assets";

export default function MySettingsPage() {
  return (
    <TeacherFigmaFrame
      svg={readAssetFile("calendar-home.svg")}
      alt="내 설정"
      width={1557}
      height={973}
      hotspots={getTeacherSidebarHotspots()}
      mySettings
      praiseCalendarExampleSvg={readAssetFile("praise-calendar-example.svg")}
    />
  );
}
