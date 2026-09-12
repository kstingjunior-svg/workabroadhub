// server/ielts-content/reading-test-1.ts
//
// Original IELTS Academic-style Reading practice test, written from scratch
// for WorkAbroadHub's IELTS Prep feature (2026-09). This is NOT a real,
// leaked, or licensed IELTS test — it is an original passage and question
// set built to the same FORMAT conventions (Matching Headings, True/False/
// Not Given, Multiple Choice) as the real exam, so a learner gets honest,
// format-accurate practice.
//
// IMPORTANT HONESTY NOTE (see also the "scoringNote" field below, which is
// surfaced to the user in the UI): the real IELTS Reading test has 40
// questions across 3 passages, and the official band conversion table is
// calibrated against that specific structure. This test has 13 questions
// on ONE passage, so we deliberately do NOT claim it produces an official
// IELTS band score. We only give an approximate, clearly-labeled practice
// score (e.g. "10/13 correct — roughly comparable to strong Band 7+
// performance on this passage type") so we never repeat the kind of
// overclaiming that was already flagged as a real problem elsewhere in the
// product (the SoP validation bug's sibling issue: promising more than the
// product actually delivers).

export interface ReadingQuestion {
  id: number;
  type: "matching_heading" | "true_false_notgiven" | "multiple_choice";
  paragraphRef?: string; // which paragraph (A-F) this question is about, for matching-heading items
  prompt: string;
  options?: string[]; // multiple choice options (A-D) — NOT included for true/false/notgiven
  correctAnswer: string; // heading numeral (e.g. "iv"), "TRUE"/"FALSE"/"NOT GIVEN", or option letter (A-D)
}

export interface ReadingParagraph {
  label: string; // "A", "B", ...
  text: string;
}

export interface ReadingTest {
  id: string;
  title: string;
  estimatedMinutes: number;
  instructions: string;
  passage: ReadingParagraph[];
  headingBank: { numeral: string; text: string }[]; // shared list for the matching-headings section
  questions: ReadingQuestion[];
  scoringNote: string;
}

export const readingTest1: ReadingTest = {
  id: "reading-test-1",
  title: "The Hidden Network Beneath the Forest Floor",
  estimatedMinutes: 20,
  instructions:
    "Read the passage below and answer all 13 questions. You have about 20 minutes. Work through the questions in order — there is no penalty for guessing, so attempt every question.",
  passage: [
    {
      label: "A",
      text:
        "For most of the twentieth century, a forest was pictured as a simple collection of individual trees, each one competing with its neighbours for light, water and space. This view has been overturned by several decades of research into a mostly invisible structure that connects trees below ground: a vast web of fungal threads known as mycorrhizal networks. Rather than standing alone, many trees are now understood to be physically and chemically linked to dozens or even hundreds of other trees, sometimes of entirely different species, through these underground connections.",
    },
    {
      label: "B",
      text:
        "The link is formed by mycorrhizal fungi, organisms that colonise the fine roots of a tree and extend outward as thread-like filaments called hyphae. In exchange for sugars produced by the tree through photosynthesis, the fungus supplies the tree with water and mineral nutrients, particularly phosphorus and nitrogen, that it has absorbed from a much larger volume of soil than the tree's own roots could reach alone. This exchange is not a minor curiosity: an estimated eighty to ninety percent of land plant species form some version of this partnership, and in many forests the fungal threads in a single teaspoon of soil, laid end to end, would stretch for several kilometres.",
    },
    {
      label: "C",
      text:
        "What makes the network especially interesting to ecologists is that a single fungal individual can connect to more than one tree at once, creating a shared channel between them. Researchers have used radioactive and stable isotope tracers to follow the movement of carbon between trees joined in this way, and have found that carbon manufactured by one tree can turn up, sometimes within days, in the tissue of a neighbouring tree it is connected to. In several documented cases, larger, older trees have been shown to send a net surplus of carbon to smaller seedlings growing in their shade, seedlings that would otherwise receive too little sunlight to photosynthesise enough for their own needs. This has led some researchers to describe large, well-connected trees informally as 'hub' trees, though the term is a simplification of a far more complex and still only partly understood set of exchanges.",
    },
    {
      label: "D",
      text:
        "The network also appears to carry information, not just nutrients. When a tree is attacked by insects or infected by a pathogen, it often produces chemical signals, and there is experimental evidence that neighbouring trees connected to the same fungal network subsequently increase their production of defensive compounds before the pest or pathogen has reached them directly. Whether this should be described as trees 'communicating', in anything resembling a deliberate or intentional sense, is a matter of ongoing scientific debate. Many researchers are careful to point out that the fungi themselves have their own evolutionary interests in these exchanges, and it is not yet settled how much of the apparent signalling benefits the trees, the fungi, both, or neither in any particular instance.",
    },
    {
      label: "E",
      text:
        "This research has practical implications for forestry and land management. Clear-cutting practices that remove all mature trees from an area, followed by planting rows of a single young species, may sever these networks and deprive new seedlings of an established supply route for water and nutrients during their most vulnerable early years. Some foresters have begun experimenting with retention practices, deliberately leaving a scattering of large, mature trees standing when an area is logged, partly on the reasoning that these trees may continue to support regrowth through the fungal connections that survive in the surrounding soil. It remains an open question how much difference this makes across different soil types, climates and tree species, and large-scale, long-term studies are still limited in number.",
    },
    {
      label: "F",
      text:
        "Public interest in these findings has, at times, outpaced the science itself. Popular accounts have occasionally presented forests as unified, almost sentient superorganisms, a framing that goes well beyond what the current evidence supports. Most researchers working in this field are more cautious, describing a set of interconnected but still largely self-interested organisms whose relationships happen to produce outcomes, such as the survival of shaded seedlings, that can look cooperative from the outside. Even with that caution, few now dispute that the underground fungal network is a major, and for a long time overlooked, feature of how forests actually function.",
    },
  ],
  headingBank: [
    { numeral: "i", text: "A cautious response to popular overstatement" },
    { numeral: "ii", text: "The physical structure of the fungal partnership" },
    { numeral: "iii", text: "A shift away from viewing trees as isolated competitors" },
    { numeral: "iv", text: "Rising costs of forest conservation programmes" },
    { numeral: "v", text: "Evidence that resources move between connected trees" },
    { numeral: "vi", text: "Chemical warning signals passed between trees" },
    { numeral: "vii", text: "Changing approaches to logging and replanting" },
    { numeral: "viii", text: "A history of mycorrhizal research funding" },
  ],
  questions: [
    {
      id: 1,
      type: "matching_heading",
      paragraphRef: "B",
      prompt: "Choose the correct heading for Paragraph B from the list of headings above.",
      correctAnswer: "ii",
    },
    {
      id: 2,
      type: "matching_heading",
      paragraphRef: "C",
      prompt: "Choose the correct heading for Paragraph C from the list of headings above.",
      correctAnswer: "v",
    },
    {
      id: 3,
      type: "matching_heading",
      paragraphRef: "D",
      prompt: "Choose the correct heading for Paragraph D from the list of headings above.",
      correctAnswer: "vi",
    },
    {
      id: 4,
      type: "matching_heading",
      paragraphRef: "E",
      prompt: "Choose the correct heading for Paragraph E from the list of headings above.",
      correctAnswer: "vii",
    },
    {
      id: 5,
      type: "true_false_notgiven",
      prompt:
        "For most of the twentieth century, forests were generally understood by scientists as networks of cooperating trees.",
      correctAnswer: "FALSE",
    },
    {
      id: 6,
      type: "true_false_notgiven",
      prompt: "Mycorrhizal fungi can connect trees of different species to one another.",
      correctAnswer: "TRUE",
    },
    {
      id: 7,
      type: "true_false_notgiven",
      prompt:
        "All plant species are known to form partnerships with mycorrhizal fungi.",
      correctAnswer: "FALSE",
    },
    {
      id: 8,
      type: "true_false_notgiven",
      prompt:
        "Scientists have reached full agreement that trees deliberately communicate with one another through fungal networks.",
      correctAnswer: "FALSE",
    },
    {
      id: 9,
      type: "true_false_notgiven",
      prompt:
        "Some foresters now leave certain mature trees standing when harvesting an area of forest.",
      correctAnswer: "TRUE",
    },
    {
      id: 10,
      type: "multiple_choice",
      prompt: "According to Paragraph B, a tree mainly supplies its mycorrhizal fungal partner with",
      options: [
        "A. water absorbed from deep soil layers.",
        "B. sugars produced through photosynthesis.",
        "C. phosphorus and nitrogen from the atmosphere.",
        "D. protection from insect pests.",
      ],
      correctAnswer: "B",
    },
    {
      id: 11,
      type: "multiple_choice",
      prompt: "The term 'hub' tree, as used in Paragraph C, is described by the writer as",
      options: [
        "A. a precise scientific classification.",
        "B. an outdated idea that has been discarded.",
        "C. a simplified way of describing a more complex reality.",
        "D. a term used only in forestry management, not research.",
      ],
      correctAnswer: "C",
    },
    {
      id: 12,
      type: "multiple_choice",
      prompt:
        "Why does the writer mention 'radioactive and stable isotope tracers' in Paragraph C?",
      options: [
        "A. To explain how fungi defend trees against disease.",
        "B. To describe a method used to track the movement of carbon between trees.",
        "C. To show how researchers measure the age of a forest.",
        "D. To illustrate a technique now considered unreliable.",
      ],
      correctAnswer: "B",
    },
    {
      id: 13,
      type: "multiple_choice",
      prompt: "What is the writer's overall attitude in Paragraph F towards popular accounts of forest 'superorganisms'?",
      options: [
        "A. Fully supportive — the evidence clearly confirms these accounts.",
        "B. Dismissive — he believes the whole field of research is flawed.",
        "C. Cautious — he thinks such accounts go beyond what current evidence shows.",
        "D. Indifferent — he does not think the question matters.",
      ],
      correctAnswer: "C",
    },
  ],
  scoringNote:
    "This is one original 13-question practice passage, not the full 40-question, 3-passage IELTS Reading test — so this score is an approximate practice indicator, not an official IELTS band. As a rough guide: 11-13 correct is comparable to strong Band 7+ performance on this passage type, 8-10 to around Band 6-6.5, 5-7 to around Band 5-5.5, and below 5 suggests it's worth reviewing paragraph-level skimming and the True/False/Not Given technique before your next attempt.",
};

export const allReadingTests: ReadingTest[] = [readingTest1];

export function getReadingTestById(testId: string): ReadingTest | undefined {
  return allReadingTests.find((t) => t.id === testId);
}
