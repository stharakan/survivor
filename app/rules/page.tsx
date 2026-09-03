"use client"

import { Suspense, type ReactNode } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useLeague } from "@/hooks/use-league"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { FileText, DollarSign, Trophy, Clock, MessageSquare } from "lucide-react"
import { LeagueGuard } from "@/components/league-guard"
import { SubtabNav } from "@/components/subtab-nav"

// A single titled content box. Each rules section is now composed of one or
// more of these -- the box title names the sub-topic, so it no longer just
// repeats the section name shown in the arrow stepper above.
function RuleBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-4 border-black">
      <CardHeader className="bg-retro-orange text-white border-b-4 border-black py-3">
        <CardTitle className="text-base md:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">{children}</CardContent>
    </Card>
  )
}

function RulesContent() {
  const { currentLeague } = useLeague()
  const searchParams = useSearchParams()
  const router = useRouter()

  // Tab management
  const activeSection = searchParams.get('section') || 'general'
  
  const setActiveSection = (section: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('section', section)
    router.push(`/rules?${params.toString()}`)
  }

  // Rules sections configuration
  const rulesSections = [
    { id: 'general', label: 'General', icon: FileText },
    { id: 'payouts', label: 'Payouts', icon: DollarSign },
    { id: 'tiebreakers', label: 'Ties', icon: Trophy },
    { id: 'cancelled', label: 'Changes', icon: Clock },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  ]

  // Clamp to 0 so an unknown ?section= in the URL still renders a valid heading.
  const sectionIndex = Math.max(0, rulesSections.findIndex((s) => s.id === activeSection))
  const prevSection = sectionIndex > 0 ? rulesSections[sectionIndex - 1] : undefined
  const nextSection = sectionIndex < rulesSections.length - 1 ? rulesSections[sectionIndex + 1] : undefined

  return (
    <div className="space-y-6">
      {/* Subtab stepper: current section is the heading, arrows step between
          sections (same arrow nav as make-picks gameweeks / results). */}
      <SubtabNav
        title={rulesSections[sectionIndex].label}
        prevLabel={prevSection?.label}
        nextLabel={nextSection?.label}
        onPrev={prevSection ? () => setActiveSection(prevSection.id) : undefined}
        onNext={nextSection ? () => setActiveSection(nextSection.id) : undefined}
      />

      {/* League line */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm text-muted-foreground">{currentLeague?.sportsLeague}</span>
        <span className="text-sm text-muted-foreground">•</span>
        <span className="font-heading text-sm">{currentLeague?.name}</span>
      </div>

      {/* Rules content -- navigated via the arrow stepper above; no sidebar or
          hamburger, so every page shares the same arrow nav. */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <div className="w-full">
              <TabsContent value="general" className="space-y-4 mt-0">
                <RuleBox title="Basics">
                  <p className="text-sm leading-relaxed">
                    Welcome to EPL Survivor! The idea is simple – pick a team every week (ideally to win) and you can only pick the same team 2 times over the course of the season. If the team you pick wins/ties, you are safe, but if the team you picked loses, you get a strike. 2 strikes and you're out (you will still have a chance to win the highest total points though).
                  </p>
                </RuleBox>

                <RuleBox title="Pick Locking">
                  <div className="text-sm leading-relaxed space-y-3">
                    <p>
                      Users can make a pick up until a particular match starts. This means a selection can be made after a GW starts, as long as the particular game they want to pick has not started.
                    </p>
                    <p>
                      This will slightly affect how the user makes picks. Before the GW starts, a user can select/change a pick like normal up until the start of the GW. If a pick has been made when the first match kicks off (regardless of whether or not the user selected a team in that first match) the pick will lock in and cannot be changed. This is because we want to allow users to see who else has made what picks (so we can chat shit) and don't want anyone to change their pick after viewing other people's picks.
                    </p>
                    <p>
                      If the user has not made a pick by the time the GW starts, they will not be able to see other users' picks until they make a pick. Once they make a selection, they will be able to see other users' picks, but they will not be able to change their selection (as we don't want them changing their minds based on other peoples' picks). This means that users should take extra caution when picking a team after a GW starts, as you will not be able to change your pick once selected.
                    </p>
                    <p className="italic">
                      Hopefully these changes will grant some more flexibility to the user, and we'll face less GIF rants from Alon
                    </p>
                  </div>
                </RuleBox>

                <RuleBox title="Scoring">
                  <div>
                    <h3 className="text-sm font-heading mb-1">Points System</h3>
                    <p className="text-sm leading-relaxed">
                      Points will be awarded as they are for regular PL games. 3 points for a win, 1 point for a tie, 0 for a loss. The 1st/2nd place payout are determined by points accumulated before getting 2 strikes.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-heading mb-1">Missed Picks</h3>
                    <p className="text-sm leading-relaxed">
                      Missed picks count as a strike. Get your shit together.
                    </p>
                  </div>
                </RuleBox>
              </TabsContent>

              <TabsContent value="payouts" className="space-y-4 mt-0">
                <RuleBox title="Definitions">
                  <p className="text-sm leading-relaxed">The payouts are awarded as follows:</p>
                  <ul className="text-sm space-y-2 ml-4">
                    <li>• <strong>1st:</strong> Given to the player with the highest total points before getting 2 strikes</li>
                    <li>• <strong>2nd:</strong> Given to the player with the 2nd highest total points before getting 2 strikes</li>
                    <li>• <strong>Longest Survivor:</strong> Given to the player who goes the furthest number of weeks before getting 1 strike</li>
                    <li>• <strong>Highest Total Points:</strong> Given to the player who has the highest total number of points after everyone is out (i.e. everyone has 2 strikes. This could happen mid-season)</li>
                  </ul>
                </RuleBox>

                <RuleBox title="Prizes">
                  <ul className="text-sm space-y-1">
                    <li>- <strong>1st:</strong> ~$1,290 (1,390 – hosting fees)</li>
                    <li>- <strong>2nd:</strong> $400</li>
                    <li>- <strong>Longest Survivor:</strong> $250</li>
                    <li>- <strong>Highest Total Points:</strong> $200</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">(56 Players, $40 buy in, ~$100 hosting fee)</p>
                </RuleBox>
              </TabsContent>

              <TabsContent value="tiebreakers" className="space-y-4 mt-0">
                <p className="text-sm leading-relaxed">
                  In the unlikely event that there is a multiple way tie for any of the above payouts, the following are used as the tie breakers (in the following order):
                </p>

                <RuleBox title="1st & 2nd Place">
                  <ol className="text-sm space-y-1 ml-4">
                    <li>1. <strong>Most Weeks survived</strong> – If tied on points, the person who survived more weeks will get the award</li>
                    <li>2. <strong>Extra Game Week</strong> – If tied on points & weeks survived, an extra match week is played to decide the winner of said payout. This tie breaker can be continued over multiple weeks if needed</li>
                    <li>3. <strong>Split the pot</strong> – If the season ends before tie breaker #2 can settle who wins, then the pot is split between the players involved in the tie breaker</li>
                  </ol>
                </RuleBox>

                <RuleBox title="Longest Survivor">
                  <ol className="text-sm space-y-1 ml-4">
                    <li>1. <strong>Most Points</strong> – Highest point tally on the week that the players pick up their second strike</li>
                    <li>2. <strong>Extra Game Week</strong> – If tied on points and wins, and extra match week is played to decide the winner of said payout. This tie breaker can be continued over multiple weeks if needed</li>
                    <li>3. <strong>Split the pot</strong> – If the season ends before tie breaker #2 can settle who wins, then the pot is split between the players involved in the tie breaker</li>
                  </ol>
                </RuleBox>

                <RuleBox title="Highest Total Points">
                  <ol className="text-sm space-y-1 ml-4">
                    <li>1. <strong>Fewest Losses/Strikes</strong> – It's called survivor after all…</li>
                    <li>2. <strong>Extra Game Week</strong> – If tied on points and losses, and extra match week is played to decide the winner of said payout. This tie breaker can be continued over multiple weeks if needed</li>
                    <li>3. <strong>Split the pot</strong> – If the season ends before tie breaker #2 can settle who wins, then the pot is split between the players involved in the tie breaker</li>
                  </ol>
                </RuleBox>
              </TabsContent>

              <TabsContent value="cancelled" className="space-y-4 mt-0">
                <p className="text-sm leading-relaxed">
                  If a game gets postponed/cancelled due to weather, a team advancing in a cup, etc, we will handle the fall out as such:
                </p>

                <RuleBox title="Cancelled Before Kickoff">
                  <p className="text-sm leading-relaxed">
                    If the game is cancelled/postponed before the game week starts, nobody will be allowed to pick that team for that week. Just one less game to choose from. The rescheduled match will not be pickable either.
                  </p>
                </RuleBox>

                <RuleBox title="Cancelled After Kickoff">
                  <p className="text-sm leading-relaxed">
                    If the game is cancelled/postponed after the game week starts (i.e. bad weather calls it off just before kickoff and picks have been made) this will be marked as a DNP for any player that selected that team. This place holder will not count as a win/tie/loss and the player will continue to the further weeks as normal. Whenever the fixture is re-scheduled, the results will be backfilled as needed for this player. Ie if the replay ended up in the player getting their second strike, they would be marked as "out" on the week the match was originally scheduled.
                  </p>
                </RuleBox>
              </TabsContent>

              <TabsContent value="feedback" className="space-y-4 mt-0">
                <p className="text-sm leading-relaxed">
                  Despite Sameer being a PhD and the golden boy of the Tharakan family, he cannot do it all. The website is a work in progress, and we will be adding improvements as the season goes on. We can't think of it all though, so we'd appreciate any feedback, especially on any bugs you find!
                </p>

                <RuleBox title="Submit Feedback">
                  <p className="text-sm">Use the following form to submit any bugs/suggestions:</p>
                  <a
                    href="https://forms.gle/EzUwqcUM7AcNwG8R7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline break-all"
                  >
                    https://forms.gle/EzUwqcUM7AcNwG8R7
                  </a>
                </RuleBox>

                <RuleBox title="Feedback Tracker">
                  <p className="text-sm">To view the full list of feedback and their fix status, see this google sheet:</p>
                  <a
                    href="https://docs.google.com/spreadsheets/d/1vRAHP0pKf17XWmidPd7Mqg7dyvzf8-SzNYa6ywx0xMQ/edit?usp=sharing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline break-all"
                  >
                    https://docs.google.com/spreadsheets/d/1vRAHP0pKf17XWmidPd7Mqg7dyvzf8-SzNYa6ywx0xMQ/edit?usp=sharing
                  </a>
                </RuleBox>
              </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

export default function RulesPage() {
  return (
    <LeagueGuard>
      <Suspense fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      }>
        <RulesContent />
      </Suspense>
    </LeagueGuard>
  )
}