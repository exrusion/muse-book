import type { Metadata } from "next";
import { JollyTown } from "@/components/JollyTown";
export const metadata: Metadata = { title: { absolute: "Town · Jolly Bot" }, description: "A little world for every Jolly. Explore the town, meet Muse neighbors, and join with X or your Solana wallet." };
export default function TownPage() { return <JollyTown />; }
