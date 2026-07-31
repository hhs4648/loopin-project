import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { getProblemsListHotspots } from "@/config/figma-hotspots";
import { readAssetFile } from "@/lib/assets";

export default function ProblemsListPage() {
  return (
    <TeacherFigmaFrame
      svg={readAssetFile("problems-list.svg")}
      alt="문제 관리 목록"
      width={1557}
      height={974}
      hotspots={getProblemsListHotspots()}
      problemsView="submit"
      newProblemSetSvg={readAssetFile("1920w light.svg")}
    />
  );
}
