import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import GovernancePage from "../page"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useParams: () => ({ id: "prop_101" }),
}))

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

describe("GovernancePage", () => {
  it("renders governance header and status tabs", () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <GovernancePage />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId("governance-page")).toBeDefined()
    expect(screen.getByText("Governance")).toBeDefined()
    expect(screen.getByTestId("status-tab-all")).toBeDefined()
    expect(screen.getByTestId("status-tab-active")).toBeDefined()
  })

  it("filters proposals by search input", async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <GovernancePage />
      </QueryClientProvider>,
    )

    const searchInput = screen.getByTestId("governance-search-input")
    fireEvent.change(searchInput, { target: { value: "Collateral" } })

    expect(await screen.findByText(/MIP-14: Lower Circle Collateral Requirement/i)).toBeDefined()
  })

  it("shows empty state when no proposals match search criteria", async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <GovernancePage />
      </QueryClientProvider>,
    )

    const searchInput = screen.getByTestId("governance-search-input")
    fireEvent.change(searchInput, { target: { value: "NonExistentProposalTitle9999" } })

    expect(await screen.findByTestId("governance-empty-state")).toBeDefined()
    expect(await screen.findByText("No proposals found")).toBeDefined()
  })
})
