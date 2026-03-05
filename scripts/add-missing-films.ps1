$json = Get-Content -Path "docs/season/season-2-cult-classics-mastered.json" -Raw | ConvertFrom-Json
$midnight = $json.nodes | Where-Object { $_.slug -eq "midnight-movies" }
$midnight.core += @{tmdbId=985;title="Eraserhead";year=1977}
$scifi = $json.nodes | Where-Object { $_.slug -eq "cult-science-fiction" }
$scifi.core += @{tmdbId=1125;title="Repo Man";year=1984}
$scifi.core += @{tmdbId=68;title="Brazil";year=1985}
$scifi.core += @{tmdbId=149;title="Akira";year=1988}
$out = $json.nodes | Where-Object { $_.slug -eq "outsider-cinema" }
$scifi.core += @{tmdbId=62;title="Ghost in the Shell";year=1995}
$out.core += @{tmdbId=11210;title="Tetsuo: The Iron Man";year=1989}
$out.core += @{tmdbId=8965;title="Audition";year=1999}
$out.core += @{tmdbId=9696;title="Ichi the Killer";year=2001}
$modern = $json.nodes | Where-Object { $_.slug -eq "modern-cult-phenomena" }
$modern.core += @{tmdbId=670;title="Oldboy";year=2003}
$modern.core += @{tmdbId=129;title="Battle Royale";year=2000}
$modern.core += @{tmdbId=1018;title="Mulholland Drive";year=2001}
$modern.core += @{tmdbId=141;title="Donnie Darko";year=2001}
$camp.core += @{tmdbId=156;title="This Is Spinal Tap";year=1984}
$camp = $json.nodes | Where-Object { $_.slug -eq "camp-cult-comedy" }
$camp.core += @{tmdbId=928;title="Heathers";year=1988}
$camp.core += @{tmdbId=115;title="The Big Lebowski";year=1998}
$video.core += @{tmdbId=2396;title="Clerks";year=1994}
$video = $json.nodes | Where-Object { $_.slug -eq "video-store-era" }
$video.core += @{tmdbId=77;title="Trainspotting";year=1996}
Write-Output "Done"
$json | ConvertTo-Json -Depth 10 | Out-File -FilePath "docs/season/season-2-cult-classics-mastered.json" -Encoding UTF8
