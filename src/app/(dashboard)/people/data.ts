export interface Person {
  id: string
  displayName: string
  username: string
  walletAddress: string
  moiScore: number
  tier: "Legend" | "Builder" | "Rising" | "Starter"
  activeCircles: number
  totalSavings: number
  country?: string
  bio: string
  joinedDate: string
}

export const MOCK_PEOPLE: Person[] = [
  {
    id: "usr_1",
    displayName: "Amara Okonkwo",
    username: "@amara_o",
    walletAddress: "GCX4B3YJ2W...7H9K",
    moiScore: 840,
    tier: "Legend",
    activeCircles: 4,
    totalSavings: 2450,
    country: "Nigeria",
    bio: "Community lead for Lagos Savings Circle. Passionate about DeFi & ROSCAs.",
    joinedDate: "2024-01-15",
  },
  {
    id: "usr_2",
    displayName: "Carlos Silva",
    username: "@carlos_s",
    walletAddress: "GBV7N2M4P1...3X8L",
    moiScore: 760,
    tier: "Builder",
    activeCircles: 3,
    totalSavings: 1800,
    country: "Brazil",
    bio: "Fintech enthusiast and Stellar network contributor.",
    joinedDate: "2024-02-10",
  },
  {
    id: "usr_3",
    displayName: "Aisha Patel",
    username: "@aisha_p",
    walletAddress: "GDK9Q5R8W2...9M4K",
    moiScore: 680,
    tier: "Rising",
    activeCircles: 2,
    totalSavings: 950,
    country: "India",
    bio: "Building micro-savings groups for women entrepreneurs.",
    joinedDate: "2024-03-01",
  },
  {
    id: "usr_4",
    displayName: "David Chen",
    username: "@david_c",
    walletAddress: "GAP3T1L6M9...2K5N",
    moiScore: 910,
    tier: "Legend",
    activeCircles: 5,
    totalSavings: 4200,
    country: "Singapore",
    bio: "DeFi liquidity provider and community validator.",
    joinedDate: "2023-11-20",
  },
  {
    id: "usr_5",
    displayName: "Fatima Al-Mansoor",
    username: "@fatima_m",
    walletAddress: "GBS8K4P2L7...6W1J",
    moiScore: 620,
    tier: "Rising",
    activeCircles: 2,
    totalSavings: 820,
    country: "UAE",
    bio: "Exploring ethical finance and Stellar smart contracts.",
    joinedDate: "2024-03-18",
  },
  {
    id: "usr_6",
    displayName: "Kwame Mensah",
    username: "@kwame_m",
    walletAddress: "GCH2X9M3P6...8Y4T",
    moiScore: 540,
    tier: "Starter",
    activeCircles: 1,
    totalSavings: 450,
    country: "Ghana",
    bio: "New member exploring community savings pools.",
    joinedDate: "2024-04-05",
  },
]
