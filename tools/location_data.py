"""Copy for the London location pages. Built by tools/build_location_pages.py.

Rules: every fact about a film office comes from that office's own page (linked).
Never say or imply we've filmed in a place unless a published case study proves it.
"""

KW = '<span class="kw">{}</span>'

CARDS = {
    "barry-road-renovation": dict(img="/assets/work/barry-road/door.jpg", alt="Sliding the doors open onto the garden at the Barry Road renovation", title="Barry Road Renovation", desc="A full house renovation told from the client's side rather than the contractor's, filmed once the family had moved back in."),
    "nimrod-road-renovation": dict(img="/assets/work/nimrod-road/living-bay.jpg", alt="The finished front living room at Nimrod Road", title="Nimrod Road, Tooting", desc="A Victorian house that had sat empty, renovated in eight weeks with a baby due, and told by the couple who paid for it."),
    "combat-sports-event-photography": dict(img="/assets/work/bjj-cover.jpg", alt="The competition mats at a Mat Masters grappling event", title="All Stars BJJ and Mat Masters", desc="Two grappling competitions covered end to end, with athlete galleries, an overview video and vertical reels the competitors share themselves."),
    "carreducker-shoemakers": dict(img="/assets/work/carreducker/interview.jpg", alt="Deborah Carre and James Ducker in front of their wall of lasts", title="Carreducker", desc="Two bespoke shoemakers in their workshop at the Oxo Tower. 210 steps and six months for a single pair."),
    "la-fromagerie": dict(img="/assets/work/la-fromagerie/patricia-talking.jpg", alt="The founder of La Fromagerie at the counter in her own shop", title="La Fromagerie", desc="Thirty three years of cheese, from a stall at Camden Lock and a shop in Highbury, told by the founder and the people who run it with her."),
    "super-efficient-drainage": dict(img="/assets/work/super-efficient-drainage.jpg", alt="A Super Efficient engineer lifting a manhole cover in a London back yard", title="Super Efficient", desc="One day on a drainage job in Enfield, cut into a YouTube film, a run of shorts and two carousels."),
    "char-gy-b-corp-video": dict(img="/video_content/gallery/chargy-bcorp.jpg", alt="A char.gy team member being interviewed in an office overlooking the City", title="char.gy B Corp film", desc="An interview film shot at their office by Monument. It's now the most watched video on their YouTube channel."),
    "easee-wycombe-square": dict(img="/video_content/gallery/easee-wycombe.jpg", alt="A white electric car parked outside a London mansion block", title="Easee, Kensington", desc="A residential charging project at a Kensington development, told by the residents and the managing agent rather than the product."),
    "lovato-maia-seminar": dict(img="/assets/work/lovato-seminar.jpg", alt="A packed mat during the Lovato and Maia seminar at London Fight Factory", title="London Fight Factory", desc="Two world champions on the mat for one afternoon, cut into a highlight film for the gym."),
    "plug-in-stations-content": dict(img="/assets/work/event-summer-party.jpg", alt="Guests talking under gazebos at a company summer event", title="Plug In Stations", desc="A monthly content partnership for an EV charger installer, including a run of content filmed in Banstead."),
}

SHARED_FAQ = [
    ("How much does a brand film cost in {name}?", "Our documentary brand films start from £15,000 + VAT, and most land between £15,000 and £25,000 + VAT. Every film is quoted as one fixed figure after a short call, because a one-location film and a multi-location film aren't the same job. Research, shooting, edit, grade, mix and the full licence are all inside it. If a film isn't the right spend yet, our one-off Spotlight shoot is £795 + VAT, a Content Day is £1,200 + VAT and case study films start from £2,500 + VAT."),
    ("How long does a brand documentary take?", "It depends on the scope. A film can take days, weeks or months, from a single location shot in a few days to a story followed over a season. We set the timeline with you on the first call, and most of the quality lives in the part that can't be rushed: the research before filming and the edit after it."),
    ("Can you film social media content for a {name} business?", "Yes. A Content Day is £1,200 + VAT and gives you a batch of short videos and photographs from one visit, edited and ready to post. If you'd rather not run the accounts yourself, our monthly plans cover the planning and posting too."),
]

SOUTH = ("South London", "https://s4digi.com/video-production-south-london")
FL = '<a href="https://filmlondon.org.uk/resource/advice-for-small-crews" target="_blank" rel="noopener">Film London</a>'
INDOORS = ("Indoors keeps it simple.", "Inside your shop, studio, kitchen or office, the council isn't involved. Most interviews happen indoors, and we only take the camera onto the street when the story needs it.")


def offer(name, films, case, social, photo):
    return [
        ("Brand films and documentaries", films, "/films", "How a film works"),
        ("Case study films", case, "/services#video", "Case study films"),
        ("Social content days", social, "/services#social", "Social content"),
        ("Photography and headshots", photo, "/personal-brand-shoot", "Spotlight shoot"),
    ]


def borough(slug, name, **kw):
    d = dict(
        slug=f"video-production-{slug}", name=name, parent=SOUTH,
        title=f"Video Production in {name} | Brand Films | s4digital",
        h1=f"Video production in&nbsp;{KW.format(name)}.",
        work_btn="See nearby work",
        offer_h2=f"What we film for {name}&nbsp;{KW.format('businesses')}.",
        places_h2=f"Places in {name} that work on&nbsp;{KW.format('camera')}.",
        know_h2=f"Filming in {name}: what to&nbsp;{KW.format('know')}.",
        areas_h2=f"Where we&nbsp;{KW.format('film')}.",
        faq_h2=f"Questions about filming in&nbsp;{KW.format(name)}.",
    )
    d.update(kw)
    return d


def region(slug, name, word, **kw):
    d = dict(
        slug=f"video-production-{slug}", name=name, parent=None,
        title=f"Video Production in {name} | Brand Films | s4digital",
        h1=f"Video production in {word}&nbsp;{KW.format('London')}.",
        work_btn="See the work",
        offer_h2=f"What we film for {name}&nbsp;{KW.format('businesses')}.",
        places_h2=f"Places in {name} that work on&nbsp;{KW.format('camera')}.",
        know_h2=f"Filming in {name}: what to&nbsp;{KW.format('know')}.",
        areas_h2=f"Where we&nbsp;{KW.format('film')}.",
        faq_h2=f"Questions about filming in {word}&nbsp;{KW.format('London')}.",
    )
    d.update(kw)
    return d


PAGES = [
    # ---------------------------------------------------------------- HUB
    dict(
        slug="video-production-london", name="London", parent=None,
        title="Video Production Company in London | Brand Films | s4digital",
        meta="London video production company. Documentary brand films from £15,000 + VAT, plus case study videos, social content and photography for businesses across North, South, East, West and central London.",
        served=["London", "South London", "North London", "East London", "West London", "Central London", "City of London", "Croydon", "Southwark", "Wandsworth", "Lambeth", "Lewisham", "Bromley", "Merton", "Kingston upon Thames", "Sutton", "Surrey"],
        h1=f"Video production in&nbsp;{KW.format('London')}.",
        intro="We're a London video production company. We make documentary brand films, case study videos, social content and photography for businesses all over the city, from a cheese shop in Highbury to an office by Monument and a renovation in Tooting. We're based in South London, and our brand films start from £15,000 + VAT.",
        work_btn="See London work",
        offer_h2=f"What we film for London&nbsp;{KW.format('businesses')}.",
        offer=offer("London",
                    "Real people and real work, researched and cut as a story rather than an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words. Builders, trades and service firms use them to win the next one.",
                    "One visit, a batch of short videos and photographs, edited and ready to post on every platform.",
                    "Team headshots, personal brand shoots and photographs of the work, taken on location or at your premises."),
        places_h2=f"Find your part of&nbsp;{KW.format('London')}.",
        places=[
            ("South London", "Home. Croydon, Southwark, Lambeth, Wandsworth, Lewisham, Bromley, Merton, Sutton and Kingston, plus Surrey.", "/video-production-south-london", "South London"),
            ("North London", "Islington, Camden, Hampstead, Haringey, Barnet and Enfield, from high streets to industrial estates.", "/video-production-north-london", "North London"),
            ("East London", "Shoreditch, Hackney, Stratford and Walthamstow, with their studios, workshops and canals.", "/video-production-east-london", "East London"),
            ("West London", "Kensington, Chelsea, Notting Hill, Hammersmith, Chiswick, Ealing and Richmond.", "/video-production-west-london", "West London"),
            ("Central London", "The City, the South Bank, Marylebone, Soho and Covent Garden.", "/video-production-central-london", "Central London"),
            ("Croydon", "Our closest town centre, a few minutes from where we're based.", "/video-production-croydon", "Croydon"),
        ],
        know_h2=f"Filming in London: what to&nbsp;{KW.format('know')}.",
        know=[
            ("Every borough runs its own filming.", f"London has 33 local authorities, each with its own film office or service. {FL} doesn't issue permits itself, but points you to the right one. We work out which office applies before the shoot and make the application."),
            ("Small crews have it easier.", f"{FL}'s guidance for a crew of five or fewer, handheld and not blocking the pavement, is that formal permission usually isn't needed on the street, but the borough still wants at least three days' notice. Some councils charge an admin fee anyway."),
            ("The City and the Royal Parks are separate.", 'The <a href="https://www.cityoflondon.gov.uk/about-us/filming/filming-fees" target="_blank" rel="noopener">City of London</a> charges even small handheld crews and wants a week\'s notice for any tripod. Hyde Park, Regent\'s Park, Richmond Park and the other <a href="https://www.royalparks.org.uk/commercial-licences/filming-photography" target="_blank" rel="noopener">Royal Parks</a> need their own licence.'),
            ("Red routes need TfL.", "Filming beside a red route means telling Transport for London as well as the borough, again with at least three days' notice. We plan around main roads where we can."),
            INDOORS,
        ],
        work_h2=f"Filmed in&nbsp;{KW.format('London')}",
        work_intro="A spread of London work: a cheese business that began in Highbury, two shoemakers on the South Bank, a B Corp film by Monument, a Kensington development, and two renovations in Tooting and East&nbsp;Dulwich.",
        work=[
            ("la-fromagerie", "Brand documentary &middot; London"),
            ("carreducker-shoemakers", "Craft film &middot; South Bank"),
            ("char-gy-b-corp-video", "Purpose film &middot; Monument"),
            ("easee-wycombe-square", "Commercial content &middot; Kensington"),
            ("nimrod-road-renovation", "Case study film &middot; Tooting"),
            ("barry-road-renovation", "Case study film &middot; East Dulwich"),
        ],
        areas_h2=f"South London, borough by&nbsp;{KW.format('borough')}.",
        areas=[
            ("Borough pages", '<a href="/video-production-croydon">Croydon</a>, <a href="/video-production-southwark">Southwark</a>, <a href="/video-production-lambeth">Lambeth</a>, <a href="/video-production-wandsworth">Wandsworth</a>, <a href="/video-production-lewisham">Lewisham</a>, <a href="/video-production-bromley">Bromley</a>, <a href="/video-production-merton">Merton</a>, <a href="/video-production-sutton">Sutton</a> and <a href="/video-production-kingston">Kingston</a>.'),
            ("Beyond London", "Surrey, Kent and the rest of the UK, and abroad when the story is somewhere else. Travel is quoted from South London as part of the one fixed figure."),
        ],
        note='See our <a href="/films">documentary films</a>, <a href="/work">every case study</a> or <a href="/services">every service and price</a>.',
        faq_h2=f"Questions about filming in&nbsp;{KW.format('London')}.",
        faq=[
            ("Do I need a permit to film in London?", "It depends on the borough and where the camera goes. On the street, most boroughs want notice even for a small handheld crew, and some charge an admin fee. The City of London and the Royal Parks have their own rules. Inside your own premises, no council permit is needed. We check which office applies and make the application."),
            ("Where are you based?", "South London, close to Croydon and Crystal Palace. That makes South London and Surrey quick to reach, and we film across the whole city, from Enfield to Kingston."),
            ("Have you filmed across London?", "Yes. Our published London work includes La Fromagerie, a cheese business that began in Highbury, the shoemakers Carreducker at the Oxo Tower, char.gy's B Corp film by Monument, a residential project in Kensington for Easee, a drainage job in Enfield and renovations in Tooting and East Dulwich."),
        ],
    ),

    # ---------------------------------------------------------------- REGIONS
    region(
        "north-london", "North London", "North",
        meta="North London video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Islington, Camden, Haringey, Barnet and Enfield.",
        served=["North London", "Islington", "Highbury", "Camden", "King's Cross", "Hampstead", "Highgate", "Haringey", "Barnet", "Enfield"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across North London, from Upper Street to the industrial estates of Enfield. We've filmed a drainage job in Enfield and a seminar just off Old Street, and our La Fromagerie documentary tells the story of a cheese business that began in Highbury. Brand films start from £15,000 + VAT.",
        offer=offer("North London",
                    "Family firms, food businesses and independents with decades behind them. We research the story and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words. Trades and service firms use them to win the next one.",
                    "One day on a real job, cut into a YouTube film, shorts and carousels. It's what we did for Super Efficient in Enfield.",
                    "Team headshots and photographs of the work, taken at your premises or somewhere that looks like North London."),
        places=[
            ("Islington and Highbury", "Upper Street, Highbury Barn and Georgian squares. Independent food, retail and design businesses."),
            ("Camden and King's Cross", "Camden Market, the Regent's Canal and Coal Drops Yard. Suits creative, music and food brands."),
            ("Hampstead and Highgate", "The Heath, village high streets and big period houses. Calm and green, good for premium services."),
            ("Enfield, Barnet and Haringey", "Industrial estates, depots and busy high roads. Where trades and family firms actually do the work."),
        ],
        know=[
            ("North London isn't one council.", f"Islington, Camden, Haringey, Barnet and Enfield each handle filming separately. {FL} points you to the right office, and we make the application."),
            ("Small crews have it easier.", f"{FL}'s guidance for a handheld crew of five or fewer that isn't blocking the pavement is that formal permission usually isn't needed, but the borough still wants at least three days' notice. Some charge an admin fee anyway."),
            ("Parks have their own rules.", 'Regent\'s Park and Primrose Hill are <a href="https://www.royalparks.org.uk/commercial-licences/filming-photography" target="_blank" rel="noopener">Royal Parks</a>, licensed separately from the council, so we plan exteriors around who owns the ground.'),
            INDOORS,
        ],
        work_h2=f"Filmed in North&nbsp;{KW.format('London')}",
        work_intro="A drainage job in Enfield, a seminar at London Fight Factory just off Old Street, and a documentary about a cheese business that began with a stall at Camden Lock and a shop in&nbsp;Highbury.",
        work=[
            ("super-efficient-drainage", "Content partnership &middot; Enfield"),
            ("lovato-maia-seminar", "Event film &middot; Old Street"),
            ("la-fromagerie", "Brand documentary &middot; London"),
        ],
        areas=[
            ("North London", "Islington, Highbury, Holloway, Camden Town, Kentish Town, King's Cross, Hampstead, Highgate, Crouch End, Muswell Hill, Tottenham, Finchley, Barnet and Enfield."),
            ("Close by", "Hackney, Stoke Newington, Clerkenwell, Bloomsbury, Marylebone and the rest of central London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, or the <a href="/video-production-east-london">East</a>, <a href="/video-production-west-london">West</a> and <a href="/video-production-central-london">central London</a> pages.',
        faq=[
            ("Do I need a permit to film in North London?", "On the street, usually notice rather than a full permit for a small handheld crew, but it depends on the borough, and some charge an admin fee. Royal Parks and private estates need their own permission. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in North London?", "Yes. We filmed a drainage job in Enfield for Super Efficient and a seminar at London Fight Factory, just off Old Street. Our La Fromagerie documentary tells the story of a business that began in Highbury and Camden."),
            ("Do you travel to North London from the south?", "Yes, all the time. We build travel into the one fixed figure, so there's no surprise mileage on the invoice."),
        ],
    ),
    region(
        "east-london", "East London", "East",
        meta="East London video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Shoreditch, Hackney, Stratford and Walthamstow.",
        served=["East London", "Shoreditch", "Hoxton", "Hackney", "Hackney Wick", "Tower Hamlets", "Stratford", "Newham", "Walthamstow", "Canary Wharf"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across East London, from Shoreditch studios to the workshops of Hackney Wick and Walthamstow. Our nearest published work is a seminar just off Old Street, on the edge of Shoreditch. Brand films start from £15,000 + VAT.",
        offer=offer("East London",
                    "Makers, breweries, studios and founders with a real story. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit to your studio, kitchen or workshop, and a batch of short videos and photographs ready to post.",
                    "Team headshots and photographs of the work, taken where you actually work."),
        places=[
            ("Shoreditch and Hoxton", "Warehouses, street art and studio spaces. The usual backdrop for creative and tech businesses."),
            ("Hackney and Hackney Wick", "Canalside workshops, breweries and makers' studios. Suits craft, food and drink brands."),
            ("Stratford and the Olympic Park", "Big open spaces, new architecture and the London Stadium. Good for sport and larger organisations."),
            ("Walthamstow and Leyton", "Walthamstow Market, the Wetlands and the workshops along Blackhorse Lane. Independent and local."),
        ],
        know=[
            ("Each borough runs its own filming.", f"Hackney, Tower Hamlets, Newham, Waltham Forest and the rest each handle filming separately. {FL} points you to the right office, and we make the application."),
            ("Small crews have it easier.", f"{FL}'s guidance for a handheld crew of five or fewer that isn't blocking the pavement is that formal permission usually isn't needed, but the borough still wants at least three days' notice."),
            ("Some big sites are private.", "The Olympic Park and the Canary Wharf estate have their own landlords and their own filming rules, separate from the council. We ask first."),
            INDOORS,
        ],
        work_h2=f"Filmed in and around East&nbsp;{KW.format('London')}",
        work_intro="We haven't published a case study from deep in East London yet, and we'd rather say so. The closest: a seminar at London Fight Factory just off Old Street, on the edge of Shoreditch, and the char.gy B Corp film at their office by&nbsp;Monument.",
        work=[
            ("lovato-maia-seminar", "Event film &middot; Old Street"),
            ("char-gy-b-corp-video", "Purpose film &middot; Monument"),
        ],
        areas=[
            ("East London", "Shoreditch, Hoxton, Hackney, Dalston, Hackney Wick, Bethnal Green, Whitechapel, Bow, Stratford, Canary Wharf, Walthamstow, Leyton and Leytonstone."),
            ("Close by", "The City, Clerkenwell, Islington, Stoke Newington and the rest of central and North London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, or the <a href="/video-production-north-london">North</a>, <a href="/video-production-west-london">West</a> and <a href="/video-production-central-london">central London</a> pages.',
        faq=[
            ("Do I need a permit to film in East London?", "On the street, usually notice rather than a full permit for a small handheld crew, but it depends on the borough. Private estates like the Olympic Park and Canary Wharf have their own rules. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in East London?", "Close to it. We filmed a seminar at London Fight Factory, just off Old Street on the edge of Shoreditch, and char.gy's B Corp film by Monument. We'll add East London case studies here as we publish them."),
            ("Do you travel to East London?", "Yes. We build travel into the one fixed figure, so there's no surprise mileage on the invoice."),
        ],
    ),
    region(
        "west-london", "West London", "West",
        meta="West London video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Kensington, Chelsea, Hammersmith, Chiswick, Ealing and Richmond.",
        served=["West London", "Kensington", "Chelsea", "Notting Hill", "Hammersmith", "Fulham", "Chiswick", "Ealing", "Richmond"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across West London, from Kensington mansion blocks to Chiswick, Ealing and Richmond. We filmed a residential charging project in Kensington for Easee. Brand films start from £15,000 + VAT.",
        offer=offer("West London",
                    "Premium brands, clinics, family firms and founders. We research the story and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client or resident tells the story in their own words, like the Kensington project we filmed for Easee.",
                    "One visit, a batch of short videos and photographs, edited and ready to post on every platform.",
                    "Team headshots and photographs of the work, at your premises or somewhere that looks the part."),
        places=[
            ("Kensington and Chelsea", "Garden squares, mansion blocks and the King's Road. Polished, premium and quiet in the mornings."),
            ("Notting Hill and Portobello", "Portobello Road market, coloured terraces and independent shops. Much easier to film midweek."),
            ("Hammersmith, Fulham and Chiswick", "The river, Chiswick High Road and riverside pubs. Good for hospitality and family firms."),
            ("Ealing and Richmond", "Ealing's Walpole Park and Richmond's riverside. Leafy, calm and easy on camera."),
        ],
        know=[
            ("Each borough runs its own filming.", f"Kensington and Chelsea, Hammersmith and Fulham, Ealing, Hounslow and Richmond each handle filming separately. {FL} points you to the right office, and we make the application."),
            ("Small crews have it easier.", f"{FL}'s guidance for a handheld crew of five or fewer that isn't blocking the pavement is that formal permission usually isn't needed, but the borough still wants at least three days' notice."),
            ("The big parks are Royal Parks.", 'Kensington Gardens, Hyde Park, Richmond Park and Bushy Park are <a href="https://www.royalparks.org.uk/commercial-licences/filming-photography" target="_blank" rel="noopener">Royal Parks</a>, and commercial filming in them needs their own licence, separate from the council.'),
            INDOORS,
        ],
        work_h2=f"Filmed in West&nbsp;{KW.format('London')}",
        work_intro="Our Easee film was shot at a residential development in Kensington and told by the residents and managing agent. Two central London films sit alongside it, a short drive&nbsp;east.",
        work=[
            ("easee-wycombe-square", "Commercial content &middot; Kensington"),
            ("carreducker-shoemakers", "Craft film &middot; South Bank"),
            ("char-gy-b-corp-video", "Purpose film &middot; Monument"),
        ],
        areas=[
            ("West London", "Kensington, Chelsea, Earl's Court, Notting Hill, Shepherd's Bush, White City, Hammersmith, Fulham, Chiswick, Acton, Ealing, Brentford and Richmond."),
            ("Close by", "Putney, Battersea, Wandsworth, Kingston and the rest of South West London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, or the <a href="/video-production-wandsworth">Wandsworth</a>, <a href="/video-production-kingston">Kingston</a> and <a href="/video-production-central-london">central London</a> pages.',
        faq=[
            ("Do I need a permit to film in West London?", "On the street, usually notice rather than a full permit for a small handheld crew, but it depends on the borough. The Royal Parks need their own licence. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in West London?", "Yes. We filmed a residential charging project at a development in Kensington for Easee, told by the residents and the managing agent."),
            ("Do you travel to West London?", "Yes. We build travel into the one fixed figure, so there's no surprise mileage on the invoice."),
        ],
    ),
    region(
        "central-london", "Central London", "central",
        h1=f"Video production in central&nbsp;{KW.format('London')}.",
        meta="Central London video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in the City, the South Bank, Marylebone, Soho and Covent Garden.",
        served=["Central London", "City of London", "South Bank", "Bankside", "Marylebone", "Fitzrovia", "Soho", "Covent Garden", "Westminster"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses in central London, from the City to the South Bank and Marylebone. We've filmed at the Oxo Tower and in an office by Monument. Brand films start from £15,000 + VAT.",
        offer=offer("central London",
                    "Firms, makers and organisations with a story worth more than a brochure. We research it and cut it as a film. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit to your office, studio or shop, and a batch of short videos and photographs ready to post.",
                    "Team headshots that look like the same company, shot in your office in one session."),
        places=[
            ("The City", "Glass towers, old churches and narrow lanes. Quiet at weekends, which makes exteriors far easier."),
            ("The South Bank and Bankside", "The river, the bridges and the Oxo Tower studios. Iconic and busy, best filmed early."),
            ("Marylebone and Fitzrovia", "Village high streets, mews and independent shops. Suits food, retail and clinics."),
            ("Soho and Covent Garden", "Studios, restaurants and theatres. Lively, so we plan around the crowds."),
        ],
        know=[
            ("The City has its own rules.", 'The <a href="https://www.cityoflondon.gov.uk/about-us/filming/filming-fees" target="_blank" rel="noopener">City of London Corporation</a> charges a fee even for a handheld crew of five or fewer, and any tripod on the street needs a Notice of No Objection, with at least a week\'s notice.'),
            ("Central London crosses several councils.", f"The City, Westminster, Camden, Southwark and Lambeth all meet in the middle, so the right film office can depend on which side of the street you're on. {FL} points to the right one, and we check before we shoot."),
            ("Royal Parks need a licence.", 'St James\'s Park, Green Park, Hyde Park and Regent\'s Park are <a href="https://www.royalparks.org.uk/commercial-licences/filming-photography" target="_blank" rel="noopener">Royal Parks</a>, licensed separately from the councils.'),
            INDOORS,
        ],
        work_h2=f"Filmed in central&nbsp;{KW.format('London')}",
        work_intro="An interview film at char.gy's office by Monument, two bespoke shoemakers in their workshop at the Oxo Tower, and a documentary about La Fromagerie, the London cheese&nbsp;business.",
        work=[
            ("char-gy-b-corp-video", "Purpose film &middot; Monument"),
            ("carreducker-shoemakers", "Craft film &middot; South Bank"),
            ("la-fromagerie", "Brand documentary &middot; London"),
        ],
        areas=[
            ("Central London", "The City, Monument, Bank, Farringdon, Clerkenwell, Holborn, Bloomsbury, Fitzrovia, Marylebone, Mayfair, Soho, Covent Garden, Westminster, the South Bank and Bankside."),
            ("Close by", "King's Cross, Islington, Shoreditch, Southwark, Lambeth and Kensington."),
        ],
        note='See all of <a href="/video-production-london">London</a>, or the <a href="/video-production-southwark">Southwark</a>, <a href="/video-production-lambeth">Lambeth</a> and <a href="/video-production-north-london">North London</a> pages.',
        faq=[
            ("Do I need a permit to film in central London?", "Usually, if we're on the street. The City charges even small handheld crews and wants a week's notice for a tripod, and Westminster and the other central boroughs have their own offices. Inside your office or shop, no council permit is needed. We handle it."),
            ("Have you filmed in central London?", "Yes. We filmed char.gy's B Corp film at their office by Monument, and the shoemakers Carreducker in their workshop at the Oxo Tower on the South Bank."),
            ("Can you film in our office during working hours?", "Yes. Most office shoots happen around a normal working day. We bring a small crew, set up in one room for interviews, and keep the rest of the floor moving."),
        ],
    ),

    # ---------------------------------------------------------------- BOROUGHS
    borough(
        "southwark", "Southwark",
        meta="Southwark video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Bermondsey, Peckham, Dulwich and Bankside.",
        served=["Southwark", "Bankside", "Borough", "Bermondsey", "Peckham", "Camberwell", "East Dulwich", "Dulwich", "Elephant and Castle", "Rotherhithe"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Southwark, from the makers on Bankside to the shops on Lordship Lane. Our Barry Road renovation film was shot in East Dulwich, and we're a short drive away in South London. Brand films start from £15,000 + VAT.",
        offer=offer("Southwark",
                    "Southwark is full of businesses with a long story behind the counter, from food halls to workshops. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words. Our Barry Road film in East Dulwich is one of them.",
                    "One visit to your kitchen, studio or shop floor, and a batch of short videos and photographs ready to post.",
                    "Team headshots and photographs of the work, taken at your premises or somewhere that says Southwark."),
        places=[
            ("Bankside and the South Bank", "The river, Tate Modern and the Oxo Tower studios. Busy, so we shoot early or find a quiet corner."),
            ("Borough and Bermondsey", "Market stalls, railway arches and the warehouses on Bermondsey Street. Great texture for food and drink."),
            ("Peckham", "Rye Lane, rooftops and converted industrial spaces. Suits creative studios and independent brands."),
            ("Dulwich and East Dulwich", "Lordship Lane's shops, leafy streets and big Victorian houses. Our Barry Road film was shot here."),
        ],
        know=[
            ("Southwark has its own film office.", 'Street filming goes through the council\'s <a href="https://www.southwark.gov.uk/culture-and-sport/arts-and-culture/filming-southwark" target="_blank" rel="noopener">filming service</a>. We make the application as part of the job.'),
            ("Small crews still tell the council.", f"{FL}'s guidance is that a handheld crew of five or fewer, not blocking the pavement, can usually film on the street, but Southwark still asks for notice, at least three days, and charges an admin fee."),
            ("Busy spots need an early start.", "Borough Market and the Thames Path are crowded most of the day, and private sites have their own say on filming, so we plan those shots for early mornings and ask first."),
            INDOORS,
        ],
        work_h2=f"Filmed in and around&nbsp;{KW.format('Southwark')}",
        work_intro="A renovation in East Dulwich told by the family who lived through it, and two bespoke shoemakers in their workshop at the Oxo Tower, on the South&nbsp;Bank.",
        work=[
            ("barry-road-renovation", "Case study film &middot; East Dulwich"),
            ("carreducker-shoemakers", "Craft film &middot; South Bank"),
            ("combat-sports-event-photography", "Events &middot; Crystal Palace and Bromley"),
        ],
        areas=[
            ("Southwark and the borough", "Bankside, Borough, London Bridge, Bermondsey, Rotherhithe, Elephant and Castle, Walworth, Camberwell, Peckham, Nunhead, East Dulwich, Dulwich Village and Herne Hill."),
            ("Close by", "Lambeth, Lewisham, Deptford, Brixton, Greenwich, the City across the river and the rest of South London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-lambeth">Lambeth</a> and <a href="/video-production-lewisham">Lewisham</a> pages.',
        faq=[
            ("Do I need a permit to film in Southwark?", "If we're filming on the street, Southwark wants notice even for a small handheld crew, at least three days, and there's an admin fee. If we're filming inside your premises, no council permit is needed. We handle the application when the shoot needs one."),
            ("Have you filmed in Southwark before?", "Yes. Our Barry Road renovation film was shot in East Dulwich, and we filmed the bespoke shoemakers Carreducker in their workshop at the Oxo Tower on the South Bank."),
            ("Are you close to Southwark?", "Yes. We're based in South London, so Peckham, Dulwich and Bermondsey are a short drive, and we can be set up early without the travel eating into the day."),
        ],
    ),
    borough(
        "wandsworth", "Wandsworth",
        meta="Wandsworth video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Tooting, Balham, Battersea, Clapham Junction and Putney.",
        served=["Wandsworth", "Tooting", "Balham", "Battersea", "Nine Elms", "Clapham Junction", "Putney", "Earlsfield", "Southfields", "Furzedown"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Wandsworth, from Tooting Market to Battersea Power Station. Our Nimrod Road renovation film was shot in Tooting, and we're a short drive away in South London. Brand films start from £15,000 + VAT.",
        offer=offer("Wandsworth",
                    "Independent restaurants, gyms, clinics and family firms with a story behind them. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story in their own words. Nimrod Road, a Victorian house in Tooting renovated in eight weeks, is one of ours.",
                    "One visit, a batch of short videos and photographs, edited and ready to post on every platform.",
                    "Team headshots and photographs of the work, taken at your premises or somewhere local."),
        places=[
            ("Tooting", "Tooting Market, Broadway Market and some of the best food in London. Lively and colourful, good for hospitality."),
            ("Battersea and Nine Elms", "The Power Station, the park and the riverside. Polished and modern, for brands that want to look big."),
            ("Clapham Junction and Northcote Road", "Independent shops, cafés and busy high streets. Northcote Road suits retail and food."),
            ("Putney and Wandsworth Town", "The river, the bridge and the rowing clubs. Calm, open and good light most of the day."),
        ],
        know=[
            ("Wandsworth's filming is run by Enable.", 'Filming permission in the borough goes through <a href="https://enablelc.org/filming/filming-in-wandsworth/" target="_blank" rel="noopener">Enable Leisure and Culture</a> on the council\'s behalf. We make the application as part of the job.'),
            ("Every street shoot needs an application.", "Unlike some boroughs, Wandsworth asks for an application whatever the crew size. Allow five working days for filming on the street, and three for parking."),
            ("Insurance is part of it.", "Enable asks for £5 million public liability cover for filming in the borough, which is worth checking with any crew you hire."),
            INDOORS,
        ],
        work_h2=f"Filmed in&nbsp;{KW.format('Wandsworth')}",
        work_intro="Our Nimrod Road film was shot in Tooting: a Victorian house that had sat empty, renovated in eight weeks and told by the couple who bought it. Barry Road in East Dulwich is another renovation told from the client's&nbsp;side.",
        work=[
            ("nimrod-road-renovation", "Case study film &middot; Tooting"),
            ("barry-road-renovation", "Case study film &middot; East Dulwich"),
        ],
        areas=[
            ("Wandsworth and the borough", "Tooting, Balham, Furzedown, Earlsfield, Wandsworth Town, Southfields, Putney, Roehampton, Battersea, Nine Elms and Clapham Junction."),
            ("Close by", "Clapham, Streatham, Wimbledon, Fulham across the river, Merton, Mitcham and the rest of South London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-lambeth">Lambeth</a> and <a href="/video-production-merton">Merton</a> pages.',
        faq=[
            ("Do I need a permit to film in Wandsworth?", "For filming on the street, yes. Wandsworth asks for an application whatever the crew size, with five working days' notice. Inside your own premises, no council permit is needed. We handle the paperwork when the shoot needs it."),
            ("Have you filmed in Wandsworth before?", "Yes. Our Nimrod Road renovation film was shot in Tooting, told by the couple who bought the house."),
            ("Are you close to Wandsworth?", "Yes. We're based in South London, so Tooting, Balham and Battersea are a short drive, and we can be set up early."),
        ],
    ),
    borough(
        "lambeth", "Lambeth",
        meta="Lambeth video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Brixton, Clapham, Streatham, Vauxhall and the South Bank.",
        served=["Lambeth", "Brixton", "Clapham", "Stockwell", "Streatham", "Vauxhall", "Kennington", "Waterloo", "South Bank", "West Norwood", "Herne Hill"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Lambeth, from Brixton Village to the South Bank. We're based in South London, a short drive from Brixton and Streatham. Brand films start from £15,000 + VAT.",
        offer=offer("Lambeth",
                    "Arts organisations, market traders and community businesses with real stories. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit to your venue, kitchen or shop, and a batch of short videos and photographs ready to post.",
                    "Team headshots and photographs of the work, taken at your premises or somewhere that says Lambeth."),
        places=[
            ("Brixton", "Brixton Village, the market arcades and Electric Avenue. Colour, noise and character, great for food and retail."),
            ("The South Bank and Waterloo", "The Southbank Centre, the National Theatre and the river walk. Good for arts organisations and big-city shots."),
            ("Clapham and Stockwell", "Clapham Common, the High Street and quiet residential streets. Suits gyms, clinics and family businesses."),
            ("Streatham, Herne Hill and Norwood", "Streatham High Road, Brockwell Park and West Norwood's high street. Calmer and local."),
        ],
        know=[
            ("Lambeth runs its own film office.", 'Street filming goes through <a href="https://film.lambeth.gov.uk/" target="_blank" rel="noopener">Film Lambeth</a>. We make the application as part of the job.'),
            ("Small handheld crews still need a permit.", "Lambeth asks for a permit even for a crew of one to five, with a risk assessment and method statement, at least three working days ahead. There are fees for small crews too."),
            ("Busy places need an early start.", "Brixton Village and the South Bank are packed by late morning, so exterior shots go first thing."),
            INDOORS,
        ],
        work_h2=f"Filmed near&nbsp;{KW.format('Lambeth')}",
        work_intro="The closest work we've published: two bespoke shoemakers at the Oxo Tower, further along the South Bank, and renovation films in Tooting and East Dulwich, a few minutes from Streatham and Herne&nbsp;Hill.",
        work=[
            ("carreducker-shoemakers", "Craft film &middot; South Bank"),
            ("nimrod-road-renovation", "Case study film &middot; Tooting"),
            ("barry-road-renovation", "Case study film &middot; East Dulwich"),
        ],
        areas=[
            ("Lambeth and the borough", "Brixton, Clapham, Stockwell, Vauxhall, Kennington, Waterloo, the South Bank, Streatham, Tulse Hill, Herne Hill and West Norwood."),
            ("Close by", "Southwark, Wandsworth, Tooting, Dulwich, Crystal Palace and the rest of South London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-southwark">Southwark</a> and <a href="/video-production-wandsworth">Wandsworth</a> pages.',
        faq=[
            ("Do I need a permit to film in Lambeth?", "For filming on the street, yes, even with a small handheld crew. Film Lambeth asks for a permit, a risk assessment and at least three working days' notice. Inside your own premises, no council permit is needed. We handle it."),
            ("Have you filmed near Lambeth?", "Yes. We filmed the shoemakers Carreducker at the Oxo Tower on the South Bank, and renovation films in Tooting and East Dulwich, both a few minutes from the Lambeth border."),
            ("Are you close to Lambeth?", "Yes. We're based in South London, so Brixton, Streatham and Clapham are a short drive, and we can be set up early."),
        ],
    ),
    borough(
        "lewisham", "Lewisham",
        meta="Lewisham video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Deptford, Brockley, Catford, Forest Hill and Sydenham.",
        served=["Lewisham", "Deptford", "New Cross", "Brockley", "Ladywell", "Catford", "Forest Hill", "Sydenham", "Lee", "Hither Green", "Blackheath"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Lewisham, from Deptford Market to Forest Hill and Sydenham. We're based in South London, a short drive away. Brand films start from £15,000 + VAT.",
        offer=offer("Lewisham",
                    "Makers, cafés, venues and family firms with a story worth telling. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit to your shop, kitchen or studio, and a batch of short videos and photographs ready to post.",
                    "Team headshots and photographs of the work, taken at your premises."),
        places=[
            ("Deptford and New Cross", "Deptford High Street, the market and the creek. Gritty, creative and full of independent makers."),
            ("Brockley and Ladywell", "Brockley Market, Hilly Fields and Victorian terraces. Suits cafés, food brands and family businesses."),
            ("Forest Hill and Sydenham", "The Horniman Museum and Gardens, and views across London from the hill. Good for culture and education."),
            ("Catford and Lewisham", "The Broadway Theatre, the town centre and busy high streets. Local businesses at street level."),
        ],
        know=[
            ("Lewisham's filming goes through The Film Office.", 'Applications are made through <a href="https://lewisham.filmoffice.co.uk/" target="_blank" rel="noopener">Lewisham\'s film office</a>. We do the paperwork.'),
            ("Small crews pay a street filming fee.", "Even a crew of one to five pays an admin fee for street filming, and applying with less than 24 hours' notice costs extra. Planning ahead keeps it cheaper."),
            ("Council land is charged by the hour.", "Filming on land the council owns carries an hourly location fee on top, so we pick locations with that in mind."),
            INDOORS,
        ],
        work_h2=f"Filmed near&nbsp;{KW.format('Lewisham')}",
        work_intro="We haven't published a case study filmed inside Lewisham yet, and we'd rather say so. The closest: a renovation in East Dulwich, just over the border, and two competitions at Crystal Palace and Bromley, a few minutes from&nbsp;Sydenham.",
        work=[
            ("barry-road-renovation", "Case study film &middot; East Dulwich"),
            ("combat-sports-event-photography", "Events &middot; Crystal Palace and Bromley"),
        ],
        areas=[
            ("Lewisham and the borough", "Deptford, New Cross, Brockley, Ladywell, Lewisham, Hither Green, Lee, Catford, Bellingham, Forest Hill, Sydenham and Blackheath."),
            ("Close by", "Greenwich, Peckham, Dulwich, Crystal Palace, Beckenham, Bromley and the rest of South East London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-southwark">Southwark</a> and <a href="/video-production-bromley">Bromley</a> pages.',
        faq=[
            ("Do I need a permit to film in Lewisham?", "For filming on the street, you apply through Lewisham's film office, and even a small crew pays an admin fee. Applying with less than 24 hours' notice costs more. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in Lewisham before?", "Close by. We made a renovation film in East Dulwich and covered competitions at Crystal Palace and Bromley. We haven't published a case study filmed inside Lewisham itself yet."),
            ("Are you close to Lewisham?", "Yes. We're based in South London, so Sydenham, Forest Hill and Catford are a short drive, and we can be set up early."),
        ],
    ),
    borough(
        "bromley", "Bromley",
        meta="Bromley video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Bromley, Beckenham, Orpington, Chislehurst and Crystal Palace.",
        served=["Bromley", "Beckenham", "Orpington", "Chislehurst", "Crystal Palace", "Penge", "Bickley", "West Wickham", "Hayes"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Bromley, from Beckenham to Orpington. We've covered competitions in the borough, at the Crystal Palace National Sports Centre and Bromley High School. Brand films start from £15,000 + VAT.",
        offer=offer("Bromley",
                    "Family firms, clinics, schools and clubs with a story worth telling. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit, a batch of short videos and photographs, edited and ready to post on every platform.",
                    "Event photography, team headshots and photographs of the work. We shot 343 edited photographs across two competition days here."),
        places=[
            ("Bromley town centre", "Market Square, the High Street and the Glades. Busy retail and services at street level."),
            ("Beckenham", "The High Street, Kelsey Park and independent cafés. Suits family businesses, clinics and gyms."),
            ("Crystal Palace Park", "The dinosaurs, the terraces and the National Sports Centre. Great for sport and big outdoor shots."),
            ("Chislehurst and Orpington", "Chislehurst's village, caves and commons, and Orpington's high street. Quieter and greener."),
        ],
        know=[
            ("Bromley's film office is run by FilmFixer.", 'Applications go through the <a href="https://filmfixer.co.uk/bromley/" target="_blank" rel="noopener">Bromley Film Office</a>. We handle it as part of the job.'),
            ("Small handheld crews are rarely charged.", f"Under {FL}'s guidance, a crew of five or fewer, handheld, no tripod and not blocking anyone, is unlikely to pay a fee, but the office still wants at least three days' notice."),
            ("Parks cost more.", "Filming in the borough's parks carries a separate location fee, so we only use them when the story needs it."),
            INDOORS,
        ],
        work_h2=f"Filmed in&nbsp;{KW.format('Bromley')}",
        work_intro="Two grappling competitions covered end to end, one at the Crystal Palace National Sports Centre and one at Bromley High School, plus a renovation film in East Dulwich, a short drive&nbsp;north.",
        work=[
            ("combat-sports-event-photography", "Events &middot; Crystal Palace and Bromley"),
            ("barry-road-renovation", "Case study film &middot; East Dulwich"),
        ],
        areas=[
            ("Bromley and the borough", "Bromley, Beckenham, Penge, Crystal Palace, Shortlands, Bickley, Chislehurst, Petts Wood, Orpington, Hayes, West Wickham and Biggin Hill."),
            ("Close by", "Sydenham, Croydon, Lewisham, Eltham, Sidcup and the rest of South East London and Kent."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-croydon">Croydon</a> and <a href="/video-production-lewisham">Lewisham</a> pages.',
        faq=[
            ("Do I need a permit to film in Bromley?", "For a small handheld crew on the street, Bromley usually wants notice rather than a fee, at least three days ahead. Parks and bigger set-ups cost more. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in Bromley before?", "Yes. We covered two grappling competitions in the borough, one at the Crystal Palace National Sports Centre and one at Bromley High School, with photographs, an overview video and reels for each."),
            ("Are you close to Bromley?", "Yes. We're based in South London, a few minutes from Crystal Palace and Beckenham, so most Bromley shoots start early with no long drive."),
        ],
    ),
    borough(
        "merton", "Merton",
        meta="Merton video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Wimbledon, Mitcham, Morden, Colliers Wood and Raynes Park.",
        served=["Merton", "Wimbledon", "Wimbledon Village", "Mitcham", "Morden", "Colliers Wood", "Raynes Park", "South Wimbledon"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Merton, from Wimbledon Village to Mitcham and Morden. We're based in South London, and our nearest film is just over the border in Tooting. Brand films start from £15,000 + VAT.",
        offer=offer("Merton",
                    "Clinics, gyms, family firms and independents with a story behind them. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit, a batch of short videos and photographs, edited and ready to post on every platform.",
                    "Team headshots and photographs of the work, taken at your premises."),
        places=[
            ("Wimbledon Village", "The High Street, the Common and big period houses. Premium, calm and photogenic."),
            ("Wimbledon town centre", "The Broadway, the theatre and busy offices. Good for professional services and retail."),
            ("Merton Abbey Mills", "A riverside craft market in old mill buildings on the Wandle. Suits makers, food and independent brands."),
            ("Mitcham and Morden", "Mitcham Common, Morden Hall Park and busy high streets. Local, green and down to earth."),
        ],
        know=[
            ("Merton has its own film office.", '<a href="https://merton.filmoffice.co.uk/" target="_blank" rel="noopener">Merton Film Office</a> handles filming in the borough. We deal with it for you.'),
            ("Small handheld crews don't need a permit on the street.", "A small handheld crew on the public highway doesn't need a permit in Merton, but it's still worth telling the film office, ideally three days ahead."),
            ("Parks and commons need a licence.", "Wimbledon Park, Mitcham Common, the council's other parks and its markets all need a filming licence from the office, not just a heads up."),
            INDOORS,
        ],
        work_h2=f"Filmed near&nbsp;{KW.format('Merton')}",
        work_intro="We haven't published a case study filmed inside Merton yet, and we'd rather say so. The closest is Nimrod Road in Tooting, a few minutes from Colliers Wood, plus another renovation film in East&nbsp;Dulwich.",
        work=[
            ("nimrod-road-renovation", "Case study film &middot; Tooting"),
            ("barry-road-renovation", "Case study film &middot; East Dulwich"),
        ],
        areas=[
            ("Merton and the borough", "Wimbledon, Wimbledon Village, South Wimbledon, Colliers Wood, Raynes Park, Morden, Mitcham and Merton Park."),
            ("Close by", "Tooting, Streatham, Sutton, Kingston, Putney and the rest of South West London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-wandsworth">Wandsworth</a>, <a href="/video-production-sutton">Sutton</a> and <a href="/video-production-kingston">Kingston</a> pages.',
        faq=[
            ("Do I need a permit to film in Merton?", "Not for a small handheld crew on the street, though it's worth telling the film office. Parks, commons and markets need a licence. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in Merton before?", "Close by. Our Nimrod Road renovation film was shot in Tooting, a few minutes from Colliers Wood. We haven't published a case study filmed inside Merton itself yet."),
            ("Are you close to Merton?", "Yes. We're based in South London, so Mitcham, Morden and Wimbledon are a short drive."),
        ],
    ),
    borough(
        "kingston", "Kingston",
        title="Video Production in Kingston upon Thames | Brand Films | s4digital",
        meta="Kingston upon Thames video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Kingston, Surbiton, New Malden and Tolworth.",
        served=["Kingston upon Thames", "Kingston", "Surbiton", "New Malden", "Tolworth", "Norbiton", "Chessington", "Berrylands"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Kingston upon Thames, from the riverside and the Ancient Market to Surbiton and New Malden. We're based in South London and film across Surrey too. Brand films start from £15,000 + VAT.",
        offer=offer("Kingston",
                    "Independent shops, restaurants, clinics and family firms with a story behind them. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit, a batch of short videos and photographs, edited and ready to post on every platform.",
                    "Team headshots and photographs of the work, taken at your premises or by the river."),
        places=[
            ("Kingston riverside", "Kingston Bridge, Canbury Gardens and the Thames path. Open water and good light for interviews and walking shots."),
            ("The Ancient Market and town centre", "The market place, the Bentall Centre and busy shopping streets. Lively at street level."),
            ("Surbiton", "The art deco station, Victoria Road and the riverside. Calm and local, good for services."),
            ("New Malden", "A high street at the heart of one of the largest Korean communities in Europe. Great for food and retail."),
        ],
        know=[
            ("Kingston's film office is run by FilmFixer.", 'Applications go through the <a href="https://filmfixer.co.uk/spotlight-on-kingston" target="_blank" rel="noopener">Kingston Film Office</a>. We make the application for you.'),
            ("Small crews pay a small admin fee.", f"Street filming with a small crew carries a modest admin fee in Kingston, and {FL}'s standard is at least three days' notice."),
            ("The river is the big asset.", "The riverside around Kingston Bridge and Canbury Gardens is the borough's best known filming spot, so we plan it early and book it properly."),
            INDOORS,
        ],
        work_h2=f"Filmed near&nbsp;{KW.format('Kingston')}",
        work_intro="We haven't published a case study filmed in Kingston yet, and we'd rather say so. The closest: a run of content for an EV charger installer filmed in Banstead, and a renovation film in&nbsp;Tooting.",
        work=[
            ("plug-in-stations-content", "Content partnership &middot; Banstead"),
            ("nimrod-road-renovation", "Case study film &middot; Tooting"),
        ],
        areas=[
            ("Kingston and the borough", "Kingston town centre, Norbiton, Surbiton, Berrylands, Tolworth, New Malden, Old Malden and Chessington."),
            ("Close by", "Richmond, Teddington, Wimbledon, Esher, Epsom, Banstead and the rest of Surrey."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-merton">Merton</a> and <a href="/video-production-sutton">Sutton</a> pages.',
        faq=[
            ("Do I need a permit to film in Kingston?", "For filming on the street, yes, through the Kingston Film Office, with a small admin fee for small crews and at least three days' notice. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in Kingston before?", "Not yet as a published case study, and we'd rather be straight about that. Our nearest is a run of content filmed in Banstead for an EV charger installer."),
            ("Do you film in Surrey as well?", "Yes. Kingston sits right on the Surrey border, and we film across Surrey, including Esher, Epsom, Banstead and Guildford."),
        ],
    ),
    borough(
        "sutton", "Sutton",
        meta="Sutton video production. Documentary brand films from £15,000 + VAT, case study videos, social content and photography for businesses in Sutton, Carshalton, Cheam, Wallington and Worcester Park.",
        served=["Sutton", "Carshalton", "Cheam", "Wallington", "Beddington", "Worcester Park", "Belmont", "Banstead"],
        intro="We make documentary brand films, case study videos, social content and photography for businesses across Sutton, from Carshalton's ponds to Cheam Village and the High Street. Our nearest work is just over the border in Banstead. Brand films start from £15,000 + VAT.",
        offer=offer("Sutton",
                    "Family firms, clinics, schools and independents with a story worth telling. We research it and cut it as a film, not an advert. From £15,000 + VAT.",
                    "A client tells the story of the job in their own words, so the next client hears it from someone like them.",
                    "One visit, a batch of short videos and photographs, edited and ready to post. It's how we work with an installer in Banstead.",
                    "Team headshots and photographs of the work, taken at your premises."),
        places=[
            ("Sutton town centre", "The High Street and its shopping centres, plus the offices around the station. Good for retail and professional services."),
            ("Carshalton", "The ponds, Honeywood Museum and Carshalton Park. A village feel, good for family businesses and cafés."),
            ("Cheam and Nonsuch Park", "Cheam's village high street and the open grounds of Nonsuch Park. Quiet and leafy."),
            ("Beddington and Wallington", "Beddington Park, Carew Manor and Wallington's high street. Historic buildings close to local businesses."),
        ],
        know=[
            ("Sutton's film office is run by FilmFixer.", '<a href="https://suttonfilmoffice.co.uk/" target="_blank" rel="noopener">Sutton Film Office</a> handles applications. We sort it as part of the job.'),
            ("Small crews pay by the hour.", "Sutton charges small crews an hourly admin fee, so a tight plan keeps the cost down."),
            ("The borough has a few famous spots.", "Carew Manor, Beddington Park, Oaks Park and the Mayfield Lavender fields are all on the film office's list, and parks have their own permissions."),
            INDOORS,
        ],
        work_h2=f"Filmed near&nbsp;{KW.format('Sutton')}",
        work_intro="We haven't published a case study filmed inside Sutton yet, and we'd rather say so. The closest is our content for an EV charger installer, filmed in Banstead just south of the border, and a renovation film in&nbsp;Tooting.",
        work=[
            ("plug-in-stations-content", "Content partnership &middot; Banstead"),
            ("nimrod-road-renovation", "Case study film &middot; Tooting"),
        ],
        areas=[
            ("Sutton and the borough", "Sutton, Carshalton, Carshalton Beeches, Wallington, Beddington, Cheam, Belmont, Worcester Park and Hackbridge."),
            ("Close by", "Banstead, Epsom, Croydon, Mitcham, Morden and the rest of Surrey and South London."),
        ],
        note='See all of <a href="/video-production-london">London</a>, our <a href="/video-production-south-london">South London and Surrey page</a>, or the neighbouring <a href="/video-production-croydon">Croydon</a>, <a href="/video-production-merton">Merton</a> and <a href="/video-production-kingston">Kingston</a> pages.',
        faq=[
            ("Do I need a permit to film in Sutton?", "For filming on the street, you apply through the Sutton Film Office, which charges small crews an hourly admin fee. Parks have their own permissions. Inside your premises, no council permit is needed. We handle it."),
            ("Have you filmed in Sutton before?", "Close by. We filmed a run of content in Banstead, just over the border, for an EV charger installer. We haven't published a case study filmed inside Sutton itself yet."),
            ("Are you close to Sutton?", "Yes. We're based in South London, so Sutton, Carshalton and Cheam are a short drive."),
        ],
    ),
]
