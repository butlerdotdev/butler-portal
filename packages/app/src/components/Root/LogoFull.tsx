import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
	container: {
		display: 'flex',
		alignItems: 'center',
		gap: 12,
	},
	logo: {
		width: 40,
		height: 40,
		borderRadius: 8,
		objectFit: 'contain',
	},
	text: {
		display: 'flex',
		flexDirection: 'column',
		lineHeight: 1.15,
	},
	primary: {
		fontSize: 16,
		fontWeight: 600,
		color: theme.palette.text.primary,
		fontFamily: '"Inter", sans-serif',
		letterSpacing: '-0.4px',
	},
	secondary: {
		fontSize: 9,
		fontWeight: 600,
		color: theme.palette.text.secondary,
		fontFamily: '"Inter", sans-serif',
		letterSpacing: '1.2px',
		textTransform: 'uppercase' as const,
		marginTop: 2,
	},
}));

const LogoFull = () => {
	const classes = useStyles();
	return (
		<div className={classes.container}>
			<img src="/butler-portal-logo.svg" alt="Butler Portal" className={classes.logo} />
			<div className={classes.text}>
				<span className={classes.primary}>Butler Portal</span>
				<span className={classes.secondary}>Butler Labs</span>
			</div>
		</div>
	);
};

export default LogoFull;
