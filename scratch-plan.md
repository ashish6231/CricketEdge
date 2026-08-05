# Toss Prediction Algorithm Analysis

I have analyzed the toss data for all matches and found the following:

Currently, the algorithm predicts the winner based primarily on **Lay Trades**. This has worked correctly for 8 out of 9 matches. 
However, in the **Colombo Kaps v Kandy Royals** match, Kandy had 7 Lay Trades while Colombo had 2. Thus, the algorithm predicted Kandy, but Colombo won.

If we look at the **Load (Total Bet Volume)** for all matches, here is the pattern:
- In almost all matches (e.g. Jaffna vs Galle, Chepauk vs Nellai, Welsh Fire vs Manchester), the team with the **HIGHER Load** won the toss.
- But in **Colombo vs Kandy**, Kandy had a massive load (₹1216) compared to Colombo (₹393), yet **Colombo won**. This is a classic "bookie favored" outcome where the team with the **LESSER Load** wins because the public heavily backed the other team.

### Proposed Load-Based Algorithm

Since relying purely on "Higher Load Wins" or "Lesser Load Wins" will fail on some matches, we need a composite algorithm:

1. **Calculate the Load Percentage**:
   Find what percentage of the total pool is on Team 1 vs Team 2.
2. **Identify Overloaded Favorites**:
   If a team has an exceptionally high load (e.g. > 75% of the total volume) AND their Lay Volume is unusually low (meaning smart money isn't laying the underdog, they are letting the public trap themselves), we predict the **UNDERDOG (Lesser Load)**.
3. **Default to Higher Load**:
   If the load is relatively balanced or the underdog has high lay volume (like in Jaffna vs Galle), we predict the team with the **HIGHER Load / Higher Lay Trades**.

Please let me know if you want me to implement this new composite algorithm in `MatchDetail.jsx`!
