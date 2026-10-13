/* Przykładowy plan – pokazuje jak program wygląda z danymi. Można go zastąpić w Menu. */
function buildSampleData(monday) {
  const P = (name, from, to) => ({ name, from, to });
  const I = (type, text, done = false) => ({ type, text, done });

  const plans = [
    { off: 0, place: 'Wilanów, ul. Różana 14', goal: 'Konstrukcja poddasza i wełna (strefa A)', status: 'done',
      people: [P('Tomasz Nowak', '07:00', '15:30'), P('Marek Kowalski', '07:00', '16:00')],
      result: 'Stelaże 65 m², pierwsza warstwa wełny gotowa.',
      items: [I('scaffold', 'Rusztowanie 3 kondygnacje', true), I('doc', 'Projekt konstrukcji', true)] },
    { off: 1, place: 'Wilanów, ul. Różana 14', goal: 'Płyty GK ognioodporne na poddaszu', status: 'plan',
      people: [P('Tomasz Nowak', '07:00', '15:30'), P('Piotr Wiśniewski', '07:00', '15:30')],
      result: '',
      items: [I('material', '20 płyt Rigips – domówić', false), I('tool', 'Podnośnik do płyt', true)] },
    { off: 1, place: 'Warszawa, Marszałkowska 88', goal: 'Trasy kablowe pod oświetlenie LED', status: 'plan',
      people: [P('Kamil Zieliński', '08:00', '16:00')],
      result: '',
      items: [I('tool', 'Bruzdownica z odkurzaczem', false)] },
    { off: 2, place: 'Warszawa, Marszałkowska 88', goal: 'Instalacja elektryczna pod oświetlenie LED', status: 'plan',
      people: [P('Kamil Zieliński', '08:00', '16:30'), P('Adam Wójcik', '08:00', '16:00')],
      result: '',
      items: [I('doc', 'Schemat rozdzielnicy', false)] },
    { off: 3, place: 'Piaseczno, ul. Polna 22', goal: 'Wieniec stropowy i szalunki', status: 'plan',
      people: [P('Marek Kowalski', '06:30', '15:30'), P('Adam Wójcik', '06:30', '15:30'), P('Piotr Wiśniewski', '06:30', '15:30')],
      result: '',
      items: [I('material', 'Beton C20/25 – pompa na 10:00', false), I('tool', 'Wibrator do betonu', false), I('scaffold', 'Rusztowanie zewnętrzne', false)] },
    { off: 4, place: 'Wilanów, ul. Różana 14', goal: 'Podkonstrukcja elewacji wentylowanej', status: 'notdone',
      people: [P('Tomasz Nowak', '07:00', '13:00')],
      result: 'Przerwane – deszcz i silny wiatr.',
      items: [I('scaffold', 'Odbiór rusztowania elewacyjnego', false)] },
    { off: 7, place: 'Pruszków, ul. Przemysłowa 5', goal: 'Montaż bramy przemysłowej', status: 'plan',
      people: [P('Marek Kowalski', '07:00', '15:30'), P('Kamil Zieliński', '07:00', '15:30')],
      result: '',
      items: [I('tool', 'Spawarka inwertorowa', false), I('tool', 'Zwyżka nożycowa (rezerwacja)', true), I('doc', 'DTR bramy', false)] },
    { off: 9, place: 'Wilanów, ul. Różana 14', goal: 'Szpachlowanie płyt GK pod malowanie', status: 'plan',
      people: [P('Tomasz Nowak', '07:00', '15:30'), P('Piotr Wiśniewski', '07:00', '15:30')],
      result: '',
      items: [I('tool', 'Agregat szpachlarski', false), I('material', 'Taśmy zbrojące', false)] }
  ];

  const data = {};
  plans.forEach(p => {
    const key = dateKey(addDays(monday, p.off));
    data[key] = data[key] || { date: key, jobs: [] };
    data[key].jobs.push({ place: p.place, goal: p.goal, status: p.status, people: p.people, result: p.result, items: p.items });
  });
  return data;
}
