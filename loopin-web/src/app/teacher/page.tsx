import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { getCalendarHomeHotspots } from "@/config/figma-hotspots";
import { readAssetFile } from "@/lib/assets";

export default function TeacherCalendarPage() {
  return (
    <TeacherFigmaFrame
      svg={readAssetFile("calendar-home.svg")}
      alt="캘린더 홈"
      width={1557}
      height={973}
      hotspots={getCalendarHomeHotspots()}
    />
  );
}
