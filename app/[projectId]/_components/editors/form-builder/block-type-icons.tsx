import {
  AlignLeft,
  Calendar,
  CaseSensitive,
  ChevronDown,
  CircleDot,
  Ellipsis,
  Hash,
  Heading,
  Mail,
  SeparatorHorizontal,
  SquareCheck,
  Star,
  Table,
  type LucideIcon,
} from "lucide-react";

import type { BlockType } from "@/lib/forms/schema";

/** Palette icon for each block type, shown in the "Add question or section" menu. */
export const BLOCK_TYPE_ICONS: Record<BlockType, LucideIcon> = {
  shortText: CaseSensitive,
  longText: AlignLeft,
  email: Mail,
  number: Hash,
  date: Calendar,
  multipleChoice: CircleDot,
  checkboxes: SquareCheck,
  dropdown: ChevronDown,
  linearScale: Ellipsis,
  rating: Star,
  matrix: Table,
  section: SeparatorHorizontal,
  statement: Heading,
};
