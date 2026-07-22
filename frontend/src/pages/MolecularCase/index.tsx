import React, { useState } from "react";

import MolecularCaseList from "./MolecularCaseList";
import MolecularCaseDetailPage from "./MolecularCaseDetailPage";

const MolecularCasePage: React.FC = () => {
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);

  if (selectedCaseId != null) {
    return <MolecularCaseDetailPage caseId={selectedCaseId} onBack={() => setSelectedCaseId(null)} />;
  }

  return <MolecularCaseList onSelectCase={setSelectedCaseId} />;
};

export default MolecularCasePage;
