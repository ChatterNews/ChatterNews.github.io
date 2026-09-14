/**
 * A room that exists in the shell but is not built yet. Says so plainly
 * rather than rendering a blank page or pretending to work.
 */
import { Link } from 'react-router-dom';

export function Soon({ name, what }: { name: string; what: string }) {
  return (
    <section className="view on">
      <div className="vh"><h1>{name}<span className="zig" /></h1></div>
      <p className="sub">{what}</p>
      <div className="sect">
        <p className="note">
          <b>Showtime is still in rehearsal.</b> Video capture, live switching, and cutting are next on the build list.
          {' '}<Link to="/">Head back to the Clubhouse.</Link>
        </p>
      </div>
    </section>
  );
}
