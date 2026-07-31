import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { getSchoolSettingsHotspots } from "@/config/figma-hotspots";
import { readAssetFile } from "@/lib/assets";

export default function SchoolSettingsPage() {
  return (
    <TeacherFigmaFrame
      svg={readAssetFile("school-settings.svg")}
      alt="학교 설정"
      width={1557}
      height={974}
      hotspots={getSchoolSettingsHotspots()}
      schoolSettings
    />
  );
}
