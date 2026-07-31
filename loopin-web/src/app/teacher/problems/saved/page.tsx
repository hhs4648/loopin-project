import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { getProblemsListHotspots } from "@/config/figma-hotspots";
import { readAssetFile } from "@/lib/assets";

export default function SavedProblemSetsPage() {
  return (
    <TeacherFigmaFrame
      svg={readAssetFile("problems-list.svg")}
      alt="사용자 지정 과제 제출"
      width={1557}
      height={974}
      hotspots={getProblemsListHotspots()}
      problemsView="saved"
      newProblemSetSvg={readAssetFile("1920w light.svg")}
    />
  );
}
