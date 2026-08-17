import { TeacherFigmaFrame } from "@/components/teacher/TeacherFigmaFrame";
import { readAssetFile } from "@/lib/assets";

export default function AssignAssignmentPage() {
  return (
    <TeacherFigmaFrame
      svg={readAssetFile("problems-list.svg")}
      alt="과제 부여"
      width={1557}
      height={974}
      hotspots={[]}
      assignAssignment
    />
  );
}
